import { execFile } from "node:child_process";
import { basename } from "node:path";
import { promisify } from "node:util";
import { codexReferences, readCodexThreads } from "./codex";
import { cleanTabName, detailFromArgs, detectAgents, parseLsof, parseProcesses, resolveTerminalTty, statusFromTab, type ItermSession, type Session } from "./sessions";

const exec = promisify(execFile);
const pexec = (file: string, args: string[]) => exec(file, args, { timeout: 3000, maxBuffer: 8 * 1024 * 1024 });
const PS = "/bin/ps";
const LSOF = "/usr/sbin/lsof";
const OSASCRIPT = "/usr/bin/osascript";

/** Share an in-flight scan between rendering, key presses and the property inspector. */
export function createScanner(report: (message: string) => void = () => {}): () => Promise<Session[]> {
	let pending: Promise<Session[]> | undefined;
	return () => pending ??= scanSessions(report).finally(() => { pending = undefined; });
}

/** Enumerate live CLI processes and task files owned by the Codex desktop app server. */
async function scanSessions(report: (message: string) => void): Promise<Session[]> {
	const { stdout } = await pexec(PS, ["-axo", "pid=,ppid=,tty=,args="]);
	const procs = parseProcesses(stdout);
	const agents = detectAgents(procs);
	if (!agents.length) return [];
	const cli = agents.filter((a) => a.source === "cli");
	const codex = agents.filter((a) => a.provider === "codex");
	const safeLsof = async (args: string[]) => {
		try { return (await pexec(LSOF, args)).stdout; }
		catch (err) {
			// lsof can exit 1 after returning useful rows if a process exited during the scan.
			const partial = (err as { stdout?: string }).stdout;
			if (partial) return partial;
			report(`lsof unavailable: ${err}`);
			return "";
		}
	};
	const [iterm, cwdOut, filesOut] = await Promise.all([
		cli.length ? getItermSessions(report) : Promise.resolve(new Map<string, ItermSession>()),
		cli.length ? safeLsof(["-a", "-p", cli.map((a) => a.proc.pid).join(","), "-d", "cwd", "-Fpn"]) : Promise.resolve(""),
		codex.length ? safeLsof(["-n", "-P", "-a", "-p", codex.map((a) => a.proc.pid).join(","), "-Fpn"]) : Promise.resolve(""),
	]);
	const cwdByPid = parseLsof(cwdOut);
	const filesByPid = parseLsof(filesOut);
	const refsByPid = new Map(codex.map((a) => [a.proc.pid, codexReferences(filesByPid.get(a.proc.pid) ?? [])]));
	const threads = await readCodexThreads([...refsByPid.values()].flat(), report);
	const itermTtys = new Set(iterm.keys());
	const sessions: Session[] = [];
	const cliThreadIds = new Set<string>();
	for (const agent of cli) {
		const { proc, provider } = agent;
		const thread = (refsByPid.get(proc.pid) ?? []).map((ref) => threads.get(ref.id)).find((t) => t !== undefined);
		if (thread) cliThreadIds.add(thread.id);
		const tty = resolveTerminalTty(proc.pid, procs, itermTtys);
		const cwd = thread?.cwd || cwdByPid.get(proc.pid)?.[0] || "";
		sessions.push({
			id: `${provider}:cli:${proc.pid}`, provider, source: "cli", pid: proc.pid, tty, cwd,
			project: cwd ? basename(cwd) : provider,
			detail: thread?.title || detailFromArgs(proc.args, provider) || cleanTabName(iterm.get(tty)?.name),
			status: thread?.status ?? statusFromTab(iterm.get(tty), provider), threadId: thread?.id,
		});
	}
	const desktopIds = new Set(cliThreadIds);
	for (const agent of agents.filter((a) => a.source === "desktop")) {
		for (const ref of refsByPid.get(agent.proc.pid) ?? []) {
			const thread = threads.get(ref.id);
			if (!thread || desktopIds.has(thread.id)) continue;
			desktopIds.add(thread.id);
			sessions.push({
				id: `codex:desktop:${thread.id}`, provider: "codex", source: "desktop", pid: agent.proc.pid,
				tty: "", cwd: thread.cwd, project: basename(thread.cwd) || "codex", detail: thread.title,
				status: thread.status ?? "idle", threadId: thread.id,
			});
		}
	}
	sessions.sort((a, b) => a.project.localeCompare(b.project) || a.provider.localeCompare(b.provider) || a.pid - b.pid || a.id.localeCompare(b.id));
	return sessions;
}

/** Map of iTerm2 session tty -> { tab name, is-processing } for every open session. */
export async function getItermSessions(report: (message: string) => void = () => {}): Promise<Map<string, ItermSession>> {
	const SEP = "::SDSEP::";
	const script = `tell application "iTerm2"
	set out to ""
	repeat with w in windows
		repeat with t in tabs of w
			repeat with s in sessions of t
				set out to out & (tty of s) & "${SEP}" & (is processing of s) & "${SEP}" & (name of s) & linefeed
			end repeat
		end repeat
	end repeat
	return out
end tell`;
	const map = new Map<string, ItermSession>();
	try {
		const { stdout } = await pexec(OSASCRIPT, ["-e", script]);
		for (const line of stdout.split("\n")) {
			const parts = line.split(SEP);
			if (parts.length < 3) continue;
			const tty = parts[0].trim();
			if (!tty) continue;
			map.set(tty, { processing: parts[1].trim() === "true", name: parts.slice(2).join(SEP).trim() });
		}
	} catch (err) {
		report(`osascript(iTerm2 list) failed: ${err}`);
	}
	return map;
}
