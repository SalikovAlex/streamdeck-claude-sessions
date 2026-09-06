import { execFile } from "node:child_process";
import { open, readdir } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { UUID, type SessionStatus } from "./sessions";

const pexec = promisify(execFile);
const SQLITE = "/usr/bin/sqlite3";
const READ_LIMIT = 256 * 1024;
const hasNameColumn = new Map<string, boolean>();

export type CodexReference = { id: string; home: string; rollout?: string };
export type CodexThread = { id: string; cwd: string; title: string; status?: SessionStatus };
type Metadata = { id: string; cwd: string; title: string; source: unknown; archived?: number; rollout_path?: string };

/** Only files held open by a live Codex process count; never enumerate saved conversation history. */
export function codexReferences(files: string[]): CodexReference[] {
	const refs = new Map<string, CodexReference>();
	for (const file of files) {
		const lock = file.match(/^(.*)\/thread-writer-locks\/([^/]+)\.lock$/);
		const rollout = file.match(/^(.*)\/sessions\/.*\/rollout-[^/]*-([0-9a-f-]{36})\.jsonl$/i);
		const match = lock ?? rollout;
		if (!match || !UUID.test(match[2])) continue;
		const key = `${match[1]}/${match[2]}`;
		const previous = refs.get(key);
		refs.set(key, { id: match[2], home: match[1], rollout: rollout ? file : previous?.rollout });
	}
	return [...refs.values()];
}

function sqlString(value: string): string { return `'${value.replace(/'/g, "''")}'`; }

async function query<T>(database: string, sql: string): Promise<T[]> {
	// -readonly prevents creating or changing Codex databases. Bound duration and output per poll.
	const { stdout } = await pexec(SQLITE, ["-readonly", "-json", "-cmd", ".timeout 200", database, sql], { timeout: 1200, maxBuffer: 2 * 1024 * 1024 });
	return stdout.trim() ? JSON.parse(stdout) as T[] : [];
}

async function newestDatabase(home: string, prefix: string): Promise<string | undefined> {
	const files = await readdir(home);
	const versions = files.flatMap((name) => {
		const match = name.match(new RegExp(`^${prefix}_(\\d+)\\.sqlite$`));
		return match ? [{ name, version: Number(match[1]) }] : [];
	}).sort((a, b) => b.version - a.version);
	return versions[0] ? join(home, versions[0].name) : undefined;
}

export function turnStatus(status: string): SessionStatus | undefined {
	if (status === "inProgress" || status === "in_progress") return "working";
	if (["completed", "interrupted", "failed"].includes(status)) return "waiting";
	return undefined;
}

function isSubagent(source: unknown): boolean {
	if (typeof source === "string") {
		try { return isSubagent(JSON.parse(source)); } catch { return source === "subagent"; }
	}
	return typeof source === "object" && source !== null && "subagent" in source;
}

/** Infer only lifecycle events, never prompt text or the contents of command output. */
export function rolloutStatus(records: unknown[]): SessionStatus | undefined {
	let status: SessionStatus | undefined;
	for (const value of records) {
		const record = value as { type?: string; payload?: { type?: string; role?: string; phase?: string } } | null;
		const p = record?.payload;
		if (!p) continue;
		if (record?.type === "event_msg") {
			if (p.type === "task_started" || p.type === "turn_started") status = "working";
			else if (["task_complete", "task_completed", "turn_complete", "turn_aborted"].includes(p.type ?? "")) status = "waiting";
		} else if (record?.type === "response_item") {
			if (p.type === "message" && p.role === "assistant" && p.phase === "final_answer") status = "waiting";
			else if (["reasoning", "function_call", "custom_tool_call"].includes(p.type ?? "")) status = "working";
		}
	}
	return status;
}

function parseLines(text: string): unknown[] {
	// Ignore the incomplete last record while Codex writes, or a partial first line from a tail read.
	return text.split("\n").slice(0, -1).flatMap((line) => {
		try { return [JSON.parse(line)]; } catch { return []; }
	});
}

async function readRollout(path: string): Promise<{ metadata?: Metadata; status?: SessionStatus }> {
	const file = await open(path, "r");
	try {
		const { size } = await file.stat();
		const head = Buffer.alloc(Math.min(size, READ_LIMIT));
		const first = await file.read(head, 0, head.length, 0);
		const records = parseLines(head.subarray(0, first.bytesRead).toString("utf8"));
		const meta = records.find((r: any) => r?.type === "session_meta") as { payload?: Record<string, any> } | undefined;
		let tail = records;
		if (size > READ_LIMIT) {
			const buffer = Buffer.alloc(READ_LIMIT);
			const last = await file.read(buffer, 0, buffer.length, size - READ_LIMIT);
			tail = parseLines(buffer.subarray(0, last.bytesRead).toString("utf8"));
		}
		const p = meta?.payload;
		return {
			metadata: p && typeof p.id === "string" && typeof p.cwd === "string"
				? { id: p.id, cwd: p.cwd, title: "", source: p.source } : undefined,
			status: rolloutStatus(tail),
		};
	} finally { await file.close(); }
}

/** Read metadata/status for known live IDs. Failures are isolated by home and by task. */
export async function readCodexThreads(refs: CodexReference[], report: (message: string) => void = () => {}): Promise<Map<string, CodexThread>> {
	const result = new Map<string, CodexThread>();
	const homes = new Map<string, CodexReference[]>();
	for (const ref of refs) homes.set(ref.home, [...homes.get(ref.home) ?? [], ref]);
	await Promise.all([...homes].map(async ([home, homeRefs]) => {
		const ids = homeRefs.map((r) => r.id).filter((id) => UUID.test(id));
		if (!ids.length) return;
		const list = ids.map(sqlString).join(",");
		let metadata = new Map<string, Metadata>();
		const statuses = new Map<string, SessionStatus>();
		try {
			const database = await newestDatabase(home, "state");
			if (database) {
				if (!hasNameColumn.has(database)) {
					const columns = await query<{ name: string }>(database, "PRAGMA table_info(threads)");
					hasNameColumn.set(database, columns.some((column) => column.name === "name"));
				}
				// Recent Codex stores the user-visible task name separately from the initial prompt.
				const title = hasNameColumn.get(database) ? "COALESCE(NULLIF(name,''),title) AS title" : "title";
				metadata = new Map((await query<Metadata>(database, `SELECT id,cwd,${title},source,archived,rollout_path FROM threads WHERE id IN (${list})`)).map((r) => [r.id, r]));
			}
		} catch (err) { report(`Codex metadata unavailable: ${err}`); }
		try {
			const history = await newestDatabase(home, "thread_history");
			if (history) {
				const rows = await query<{ thread_id: string; status: string }>(history, `SELECT t.thread_id,t.status FROM thread_turns t WHERE t.thread_id IN (${list}) AND t.rollout_ordinal=(SELECT MAX(u.rollout_ordinal) FROM thread_turns u WHERE u.thread_id=t.thread_id)`);
				for (const row of rows) { const status = turnStatus(row.status); if (status) statuses.set(row.thread_id, status); }
			}
		} catch (err) { report(`Codex turn status unavailable: ${err}`); }
		await Promise.all(homeRefs.map(async (ref) => {
			let meta = metadata.get(ref.id);
			if (meta?.archived || isSubagent(meta?.source)) return;
			let status = statuses.get(ref.id);
			const rollout = ref.rollout ?? meta?.rollout_path;
			if (rollout && (!meta || !status)) {
				try {
					const data = await readRollout(rollout);
					meta ??= data.metadata;
					status ??= data.status;
				} catch (err) { report(`Codex session ${ref.id} unavailable: ${err}`); }
			}
			if (!meta || meta.id !== ref.id || isSubagent(meta.source)) return;
			result.set(ref.id, { id: ref.id, cwd: meta.cwd, title: meta.title, status });
		}));
	}));
	return result;
}

export function codexTaskUrl(threadId: string): string {
	if (!UUID.test(threadId)) throw new Error("Invalid Codex task ID");
	return `codex://threads/${threadId}`;
}
