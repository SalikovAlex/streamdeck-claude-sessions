import streamDeck, { action, KeyAction, KeyDownEvent, SingletonAction, WillAppearEvent } from "@elgato/streamdeck";
import { execFile } from "node:child_process";
import { basename } from "node:path";
import { promisify } from "node:util";

const pexec = promisify(execFile);

// Absolute paths — Stream Deck runs the plugin with a minimal PATH that omits /usr/sbin (lsof).
const PS = "/bin/ps";
const LSOF = "/usr/sbin/lsof";
const OSASCRIPT = "/usr/bin/osascript";

/** Stream Deck + has 4 columns of keys (2 rows). slot = row * COLS + column. */
const COLS = 4;
/** How often the keys are refreshed from the live process list. */
const REFRESH_MS = 2000;
/** The top-left key (slot 0) is the unified summary/toggle key — never a session. */
const CONTROL_SLOT = 0;

/** "summary" shows an aggregate card (default); "detail" shows one session per key. */
type ViewMode = "detail" | "summary";
let viewMode: ViewMode = "summary"; // plugin-global (shared across all key instances)

/**
 * Status inferred from the iTerm2 tab title that Claude Code sets:
 *  - "working": a braille spinner glyph (Claude is thinking / running a tool), or the session is producing output.
 *  - "waiting": the "✳" glyph — Claude finished its turn and wants you (next prompt, a question, or a permission confirm).
 *  - "idle": no recognisable Claude glyph (e.g. plain shell).
 */
type SessionStatus = "working" | "waiting" | "idle";

type Session = {
	pid: number;
	tty: string; // e.g. /dev/ttys003
	cwd: string;
	project: string; // basename of cwd
	detail: string; // resume label or iTerm2 tab name
	status: SessionStatus;
};

/**
 * One key = one "slot". The slot index is derived from the key's coordinates, so the action works
 * no matter where the user places it. Every {@link REFRESH_MS} we scan the running `claude` processes
 * and paint slot N with session N (sorted by project, then pid). Pressing a key focuses the matching
 * iTerm2 tab.
 */
@action({ UUID: "com.salikov.claude-sessions.slot" })
export class SessionSlot extends SingletonAction {
	private timer?: ReturnType<typeof setInterval>;

	private lastSignature = "";

	override onWillAppear(ev: WillAppearEvent): void | Promise<void> {
		this.ensureTimer();
		return this.refresh();
	}

	override onWillDisappear(): void {
		// When the Claude Sessions page is no longer shown, stop polling to stay idle.
		const stillVisible = [...this.actions].some((a) => a.isKey());
		if (!stillVisible && this.timer) {
			clearInterval(this.timer);
			this.timer = undefined;
		}
	}

	override async onKeyDown(ev: KeyDownEvent): Promise<void> {
		const slot = slotOf(ev.action);

		// In summary view, any tap expands to the per-session view ("show all").
		if (viewMode === "summary") {
			viewMode = "detail";
			await this.refresh();
			return;
		}

		// In detail view, the control key collapses back to the summary ("summarise again").
		if (slot === CONTROL_SLOT) {
			viewMode = "summary";
			await this.refresh();
			return;
		}

		// Otherwise it's a session key (slots 1..7 -> session 0..6) — jump to its iTerm2 tab.
		const sessions = await scanSessions().catch(() => [] as Session[]);
		const target = slot >= 1 ? sessions[slot - 1] : undefined;
		if (!target) {
			await ev.action.showAlert();
			return;
		}
		try {
			const ok = await focusTty(target.tty);
			if (!ok) await ev.action.showAlert();
		} catch (err) {
			streamDeck.logger.error(`focus failed for ${target.tty}: ${err}`);
			await ev.action.showAlert();
		}
	}

	private ensureTimer(): void {
		if (this.timer) return;
		this.timer = setInterval(() => void this.refresh(), REFRESH_MS);
	}

	private async refresh(): Promise<void> {
		const visible = [...this.actions].filter((a): a is KeyAction => a.isKey());
		if (visible.length === 0) return; // page not shown — skip the scan entirely

		let sessions: Session[] = [];
		try {
			sessions = await scanSessions();
		} catch (err) {
			streamDeck.logger.error(`scan failed: ${err}`);
		}

		const signature = `${viewMode}|` + sessions.map((s) => `${s.project}/${s.detail}[${s.status}]`).join(", ");
		if (signature !== this.lastSignature) {
			streamDeck.logger.info(`[${viewMode}] ${sessions.length} session(s): ${signature.slice(viewMode.length + 1)}`);
			this.lastSignature = signature;
		}

		for (const a of visible) {
			const slot = slotOf(a);
			try {
				await a.setTitle("");
				await a.setImage(toDataUri(renderKey(slot, sessions)));
			} catch (err) {
				streamDeck.logger.error(`setImage failed (slot ${slot}): ${err}`);
			}
		}
	}
}

/** Decide what a given slot should display given the current view mode. */
function renderKey(slot: number, sessions: Session[]): string {
	// The control key is the summary card in summary view, and the "Summarise" toggle in detail view.
	if (slot === CONTROL_SLOT) return viewMode === "summary" ? renderSummary(sessions) : renderControl(sessions);
	// Other keys: blank in summary view; one session each (slot 1..7 -> session 0..6) in detail view.
	if (viewMode === "summary") return renderDim();
	return renderSvg(sessions[slot - 1]);
}

/** Stream Deck's setImage is most reliable with a base64-encoded data URI. */
function toDataUri(svg: string): string {
	return `data:image/svg+xml;base64,${Buffer.from(svg, "utf-8").toString("base64")}`;
}

/** Derive the slot index (0-based) from a key action's coordinates. */
function slotOf(a: KeyAction | { coordinates?: { column: number; row: number } }): number {
	const c = (a as KeyAction).coordinates;
	if (!c) return -1;
	return c.row * COLS + c.column;
}

type Proc = { pid: number; ppid: number; tty: string; args: string };

/**
 * Enumerate running Claude Code sessions.
 *
 * Topology note (iTerm2): a session is `login → zsh (qterm) → zsh → claude`, where the qterm
 * wrapper allocates a *fresh* pty. So the claude process's own tty is NOT the tty iTerm2 reports
 * for the session. We therefore walk the process ancestry of each claude and pick the first
 * ancestor whose tty matches a real iTerm2 session tty — that's the tab we focus on press.
 */
async function scanSessions(): Promise<Session[]> {
	const { stdout: psOut } = await pexec(PS, ["-axo", "pid=,ppid=,tty=,args="]).catch((e) => {
		streamDeck.logger.error(`ps failed: ${e}`);
		return { stdout: "" };
	});
	const procs = new Map<number, Proc>();
	const claudePids: number[] = [];
	for (const line of psOut.split("\n")) {
		const m = line.trim().match(/^(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/);
		if (!m) continue;
		const pid = parseInt(m[1], 10);
		const ppid = parseInt(m[2], 10);
		const tty = m[3];
		const args = m[4];
		procs.set(pid, { pid, ppid, tty, args });
		const first = args.split(/\s+/)[0] ?? "";
		if (basename(first) === "claude") claudePids.push(pid);
	}
	if (claudePids.length === 0) return [];

	const itermSessions = await getItermSessions(); // tty -> { name, processing }
	const itermTtys = new Set(itermSessions.keys());

	const { stdout: lsofOut } = await pexec(LSOF, ["-a", "-p", claudePids.join(","), "-d", "cwd", "-Fpn"]).catch((e) => {
		streamDeck.logger.error(`lsof failed: ${e}`);
		return { stdout: "" };
	});
	const cwdByPid = parseLsofCwd(lsofOut);

	const sessions: Session[] = [];
	for (const pid of claudePids) {
		const proc = procs.get(pid);
		if (!proc) continue;
		const tty = resolveTerminalTty(pid, procs, itermTtys);
		const cwd = cwdByPid.get(pid) ?? "";
		const project = cwd ? basename(cwd) : "claude";
		const iterm = itermSessions.get(tty);
		// Prefer a non-UUID --resume label; else the (cleaned) iTerm2 tab name; else fall back to pid.
		const detail = detailFromArgs(proc.args) || cleanTabName(iterm?.name);
		const status = statusFromTab(iterm);
		sessions.push({ pid, tty, cwd, project, detail, status });
	}

	sessions.sort((a, b) => a.project.localeCompare(b.project) || a.pid - b.pid);
	return sessions;
}

/** Clean an iTerm2 tab name for display: drop leading status glyphs and the trailing " (cmd)". */
function cleanTabName(name: string | undefined): string {
	if (!name) return "";
	return name
		.replace(/^[^\p{L}\p{N}]+/u, "") // leading spinner/status glyphs
		.replace(/\s*\(.*$/, "") // trailing " (Python)" / " (claude)" command hint
		.trim();
}

function normalizeTty(raw: string): string {
	if (raw.startsWith("/dev/")) return raw;
	if (raw.startsWith("tty")) return `/dev/${raw}`;
	return `/dev/tty${raw}`; // e.g. "s003" -> /dev/ttys003
}

type ItermSession = { name: string; processing: boolean };

/** Map of iTerm2 session tty -> { tab name, is-processing } for every open session. */
async function getItermSessions(): Promise<Map<string, ItermSession>> {
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
		streamDeck.logger.error(`osascript(iTerm2 list) failed: ${err}`);
	}
	return map;
}

/** Infer Claude's state from the leading glyph of the iTerm2 tab title (and output activity). */
function statusFromTab(iterm: ItermSession | undefined): SessionStatus {
	if (!iterm) return "idle";
	const glyph = iterm.name.trimStart().codePointAt(0) ?? 0;
	if (glyph >= 0x2800 && glyph <= 0x28ff) return "working"; // braille spinner = thinking / running a tool
	if (glyph === 0x2733) return "waiting"; // ✳ = Claude finished its turn / wants you
	return iterm.processing ? "working" : "idle";
}

/** Walk up the process tree from {@link pid}; return the first ancestor tty that iTerm2 owns. */
function resolveTerminalTty(pid: number, procs: Map<number, Proc>, itermTtys: Set<string>): string {
	let current = procs.get(pid);
	const ownTty = current ? normalizeTty(current.tty) : "";
	for (let hops = 0; current && hops < 12; hops++) {
		const tty = normalizeTty(current.tty);
		if (itermTtys.has(tty)) return tty;
		current = procs.get(current.ppid);
	}
	return ownTty; // fallback: focus will simply no-op if this isn't an iTerm2 session
}

function detailFromArgs(args: string): string {
	const resume = args.match(/--resume[=\s]+(\S+)/) || args.match(/(?:^|\s)-r[=\s]+(\S+)/);
	if (resume) {
		const v = resume[1];
		// A UUID isn't a useful label — fall through to the iTerm2 tab name instead.
		if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) return "";
		return v;
	}
	if (/(?:^|\s)--continue\b/.test(args) || /(?:^|\s)-c\b/.test(args)) return "continue";
	return "";
}

function parseLsofCwd(out: string): Map<number, string> {
	const map = new Map<number, string>();
	let cur = 0;
	for (const line of out.split("\n")) {
		if (line.startsWith("p")) cur = parseInt(line.slice(1), 10);
		else if (line.startsWith("n")) map.set(cur, line.slice(1));
	}
	return map;
}

/** Bring the iTerm2 window/tab/session whose tty matches to the front. Returns false if not found. */
async function focusTty(tty: string): Promise<boolean> {
	const script = `on run argv
	set targetTTY to item 1 of argv
	tell application "iTerm2"
		repeat with w in windows
			repeat with t in tabs of w
				repeat with s in sessions of t
					if (tty of s) is targetTTY then
						tell t to select
						tell s to select
						try
							set index of w to 1
						end try
						try
							set frontmost of w to true
						end try
						activate
						return "ok"
					end if
				end repeat
			end repeat
		end repeat
	end tell
	return "notfound"
end run`;
	const { stdout } = await pexec(OSASCRIPT, ["-e", script, tty]);
	return stdout.trim() === "ok";
}

function esc(s: string): string {
	return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function truncate(s: string, n: number): string {
	return s.length <= n ? s : `${s.slice(0, n - 1)}…`;
}

const STATUS_THEME: Record<SessionStatus, { color: string; label: string }> = {
	working: { color: "#f5a623", label: "working" }, // amber — Claude is thinking / running a tool
	waiting: { color: "#2ec27e", label: "your turn" }, // green — finished / asking you / needs a confirm
	idle: { color: "#6b7280", label: "idle" }, // grey — no recognisable state
};

const FONT = "Helvetica,Arial,sans-serif";

/** Render a key as an SVG string. Empty slots get a dim placeholder. */
function renderSvg(s: Session | undefined): string {
	const W = 144;
	const H = 144;
	if (!s) {
		return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<rect width="${W}" height="${H}" rx="16" fill="#15171a"/>
<circle cx="72" cy="62" r="5" fill="#33373d"/>
<text x="72" y="100" font-family="${FONT}" font-size="16" fill="#3a3f45" text-anchor="middle">empty</text>
</svg>`;
	}
	const theme = STATUS_THEME[s.status];
	const proj = esc(truncate(s.project, 11));
	const detail = esc(truncate(s.detail || `pid ${s.pid}`, 14));
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<rect width="${W}" height="${H}" rx="16" fill="#0e1726"/>
<rect width="${W}" height="11" fill="${theme.color}"/>
<text x="72" y="62" font-family="${FONT}" font-weight="700" font-size="24" fill="#ffffff" text-anchor="middle">${proj}</text>
<text x="72" y="88" font-family="${FONT}" font-size="16" fill="#9fb3cc" text-anchor="middle">${detail}</text>
<circle cx="40" cy="118" r="6" fill="${theme.color}"/>
<text x="54" y="123" font-family="${FONT}" font-weight="600" font-size="16" fill="${theme.color}" text-anchor="start">${theme.label}</text>
</svg>`;
}

function countByStatus(sessions: Session[]): Record<SessionStatus, number> {
	const c: Record<SessionStatus, number> = { working: 0, waiting: 0, idle: 0 };
	for (const s of sessions) c[s.status]++;
	return c;
}

/** Summary card: total session count + a per-status breakdown. Top bar reflects "needs you" first. */
function renderSummary(sessions: Session[]): string {
	const W = 144;
	const H = 144;
	const c = countByStatus(sessions);
	const accent = c.waiting > 0 ? STATUS_THEME.waiting.color : c.working > 0 ? STATUS_THEME.working.color : STATUS_THEME.idle.color;
	const row = (y: number, status: SessionStatus, n: number) =>
		`<circle cx="22" cy="${y - 5}" r="5" fill="${STATUS_THEME[status].color}"/>` +
		`<text x="34" y="${y}" font-family="${FONT}" font-size="16" fill="#cdd9e8" text-anchor="start">${n} ${STATUS_THEME[status].label}</text>`;
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<rect width="${W}" height="${H}" rx="16" fill="#0e1726"/>
<rect width="${W}" height="11" fill="${accent}"/>
<text x="72" y="34" font-family="${FONT}" font-weight="700" font-size="20" fill="#ffffff" text-anchor="middle">${sessions.length} Claude</text>
${row(60, "working", c.working)}
${row(86, "waiting", c.waiting)}
${row(112, "idle", c.idle)}
<text x="72" y="135" font-family="${FONT}" font-weight="600" font-size="13" fill="#6f9bd6" text-anchor="middle">▸ show all</text>
</svg>`;
}

/** The control key shown in detail view — collapses back to the summary. Badges the count needing you. */
function renderControl(sessions: Session[]): string {
	const W = 144;
	const H = 144;
	const needYou = countByStatus(sessions).waiting;
	const glyph = "≡";
	const label = "Summarise";
	const badge =
		needYou > 0
			? `<circle cx="118" cy="26" r="13" fill="${STATUS_THEME.waiting.color}"/>` +
				`<text x="118" y="32" font-family="${FONT}" font-weight="700" font-size="17" fill="#06281a" text-anchor="middle">${needYou}</text>`
			: "";
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<rect width="${W}" height="${H}" rx="16" fill="#1b2433"/>
<rect width="${W}" height="11" fill="#3d6fb0"/>
<text x="72" y="84" font-family="${FONT}" font-weight="700" font-size="40" fill="#9fc1ee" text-anchor="middle">${glyph}</text>
<text x="72" y="118" font-family="${FONT}" font-weight="600" font-size="17" fill="#cdd9e8" text-anchor="middle">${label}</text>
${badge}
</svg>`;
}

/** A dim filler key shown in summary mode for the non-summary, non-control slots. */
function renderDim(): string {
	const W = 144;
	const H = 144;
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" rx="16" fill="#0b0f15"/></svg>`;
}
