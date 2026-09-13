import { basename } from "node:path";

export type SessionStatus = "working" | "waiting" | "idle";
export type Provider = "claude" | "codex";
export type Session = {
	id: string;
	provider: Provider;
	source: "cli" | "desktop";
	pid: number;
	tty: string;
	cwd: string;
	project: string;
	detail: string;
	status: SessionStatus;
	threadId?: string;
};
export type Proc = { pid: number; ppid: number; tty: string; args: string };
export type ItermSession = { name: string; processing: boolean };
export type AgentProcess = { proc: Proc; provider: Provider; source: "cli" | "desktop" };

export function parseProcesses(out: string): Map<number, Proc> {
	const procs = new Map<number, Proc>();
	for (const line of out.split("\n")) {
		const m = line.trim().match(/^(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/);
		if (m) procs.set(+m[1], { pid: +m[1], ppid: +m[2], tty: m[3], args: m[4] });
	}
	return procs;
}

/** ps does not preserve argv boundaries; handle quoted labels and the usual npm launchers. */
function words(args: string): string[] {
	return (args.match(/"[^"\n]*"|'[^'\n]*'|[^\s]+/g) ?? []).map((s) => s.replace(/^(["'])(.*)\1$/, "$2"));
}

const CODEX_VALUE_OPTIONS = new Set(["-c", "--config", "-m", "--model", "-p", "--profile", "-s", "--sandbox", "-a", "--ask-for-approval", "-C", "--cd", "--add-dir", "-i", "--image", "--enable", "--disable", "--remote", "--remote-auth-token-env", "--local-provider"]);
const CODEX_COMMANDS = new Set(["agents", "exec", "e", "review", "login", "logout", "mcp", "plugin", "mcp-server", "app-server", "remote-control", "app", "completion", "update", "doctor", "sandbox", "debug", "apply", "a", "queue", "archive", "delete", "migrate-rollouts", "unarchive", "cloud", "exec-server", "features", "help"]);

function codexPositionals(args: string[]): string[] {
	const result: string[] = [];
	for (let i = 0; i < args.length; i++) {
		const word = args[i];
		if (word === "--") return [...result, ...args.slice(i + 1)];
		if (CODEX_VALUE_OPTIONS.has(word)) { i++; continue; }
		if (!word.startsWith("-")) result.push(word);
	}
	return result;
}

function agentProcess(proc: Proc): AgentProcess | undefined {
	// Match the full app path first: application names and enclosing directories can contain spaces.
	const appCommand = proc.args.match(/^\/?[^\n]*\/(?:Codex|ChatGPT)\.app\/Contents\/Resources\/codex(?:\s+(.*))?$/);
	const argv = appCommand ? ["codex", ...words(appCommand[1] ?? "")] : words(proc.args);
	if (appCommand && codexPositionals(argv.slice(1))[0] === "app-server") {
		return { proc, provider: "codex", source: "desktop" };
	}
	let executable = basename(argv.shift() ?? "");
	if (executable === "node" || executable === "bun") {
		const script = argv.shift() ?? "";
		if (/(?:^|\/)@openai\/codex\/bin\/codex\.js$/.test(script) || /(?:^|\/)codex(?:\.js)?$/.test(script)) executable = "codex";
		else return;
	}
	if (executable === "claude") return { proc, provider: "claude", source: "cli" };
	if (executable !== "codex" || !hasTty(proc.tty)) return;
	const command = codexPositionals(argv)[0];
	if (argv.some((a) => ["--help", "-h", "--version", "-V"].includes(a)) || CODEX_COMMANDS.has(command)) return;
	return { proc, provider: "codex", source: "cli" };
}

export function detectAgents(procs: Map<number, Proc>): AgentProcess[] {
	const agents = [...procs.values()].flatMap((p) => agentProcess(p) ?? []);
	// npm's node launcher stays alive while its native Codex child runs. Count the child once.
	const wrappers = new Set<number>();
	for (const agent of agents) {
		let parent = procs.get(agent.proc.ppid);
		for (let hops = 0; parent && hops < 20; hops++, parent = procs.get(parent.ppid)) {
			if (agents.some((a) => a.proc.pid === parent!.pid && a.provider === agent.provider && a.source === "cli")) wrappers.add(parent.pid);
		}
	}
	return agents.filter((a) => !wrappers.has(a.proc.pid));
}

function hasTty(tty: string): boolean { return tty !== "?" && tty !== "??" && tty !== "-"; }

export function normalizeTty(raw: string): string {
	if (!hasTty(raw)) return "";
	if (raw.startsWith("/dev/")) return raw;
	return `/dev/${raw.startsWith("tty") ? raw : `tty${raw}`}`;
}

/** qterm can allocate another pty; find the nearest ancestor owned by iTerm2. */
export function resolveTerminalTty(pid: number, procs: Map<number, Proc>, itermTtys: Set<string>): string {
	let current = procs.get(pid);
	const ownTty = current ? normalizeTty(current.tty) : "";
	for (let hops = 0; current && hops < 20; hops++, current = procs.get(current.ppid)) {
		const tty = normalizeTty(current.tty);
		if (itermTtys.has(tty)) return tty;
	}
	return ownTty;
}

export function detailFromArgs(args: string, provider: Provider): string {
	if (provider === "codex") {
		const argv = words(args);
		const command = codexPositionals(argv.slice(argv[0]?.endsWith("node") ? 2 : 1));
		if (command[0] !== "resume" && command[0] !== "fork") return "";
		const label = command[1] ?? "";
		return UUID.test(label) ? "" : label;
	}
	const resume = args.match(/(?:--resume|(?:^|\s)-r)[=\s]+("[^"]+"|'[^']+'|\S+)/);
	if (resume) {
		const label = resume[1].replace(/^(["'])(.*)\1$/, "$2");
		return UUID.test(label) ? "" : label;
	}
	return /(?:^|\s)(?:--continue|-c)\b/.test(args) ? "continue" : "";
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function cleanTabName(name: string | undefined): string {
	return (name ?? "").replace(/^[^\p{L}\p{N}]+/u, "").replace(/\s*\(.*$/, "").trim();
}

export function statusFromTab(iterm: ItermSession | undefined, provider: Provider): SessionStatus {
	if (!iterm) return "idle";
	const glyph = iterm.name.trimStart().codePointAt(0) ?? 0;
	if (glyph >= 0x2800 && glyph <= 0x28ff) return "working";
	if (provider === "claude" && glyph === 0x2733) return "waiting";
	return iterm.processing ? "working" : "idle";
}

/** lsof -F output: keep all file names for each process, including cwd and open Codex files. */
export function parseLsof(out: string): Map<number, string[]> {
	const map = new Map<number, string[]>();
	let pid = 0;
	for (const line of out.split("\n")) {
		if (line.startsWith("p")) { pid = Number(line.slice(1)); if (!map.has(pid)) map.set(pid, []); }
		else if (line.startsWith("n") && pid) map.get(pid)!.push(line.slice(1));
	}
	return map;
}
