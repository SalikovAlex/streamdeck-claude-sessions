import streamDeck, { action, KeyAction, KeyDownEvent, SingletonAction } from "@elgato/streamdeck";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { codexTaskUrl } from "../codex";
import { type Session, type SessionStatus } from "../sessions";
import { createScanner, getItermSessions } from "../scanner";

const exec = promisify(execFile);
const pexec = (file: string, args: string[]) => exec(file, args, { timeout: 3000, maxBuffer: 8 * 1024 * 1024 });

// Absolute paths — Stream Deck runs the plugin with a minimal PATH.
const OSASCRIPT = "/usr/bin/osascript";
const OPEN = "/usr/bin/open";
const scanSessions = createScanner((message) => streamDeck.logger.debug(message));

/** How often the keys are refreshed from the live process list. */
const REFRESH_MS = 2000;

/** Name of the bundled profile we open from a lone status key. Must match manifest Profiles[].Name. */
const DECK_PROFILE = "Claude Sessions";

/**
 * Each visible key is assigned a role by its *relative position* among the action's keys on the same
 * device (sorted by row, then column) — NOT by absolute coordinates — so it works in any profile, on
 * any device, wherever the keys are placed:
 *   - A single key on its own = a status widget (summary card); pressing it opens the bundled
 *     "Claude Sessions" deck.
 *   - With several keys (the deck): the first key is a "‹ Summary" control that returns to the
 *     previous profile; the rest are sessions in reading order — press one to open its iTerm2 tab or Codex task.
 * Every {@link REFRESH_MS} we scan Claude/Codex CLI processes and loaded Codex desktop tasks and repaint.
 */
@action({ UUID: "com.salikov.claude-sessions.slot" })
export class SessionSlot extends SingletonAction {
	private timer?: ReturnType<typeof setInterval>;
	private debounce?: ReturnType<typeof setTimeout>;

	private lastSignature = "";
	private refreshing = false;
	private displayedSessions = new Map<string, Session>();

	override onWillAppear(): void {
		// Don't paint mid-transition: during a page/profile switch keys appear one-by-one, and a lone
		// transient key would briefly render the summary card. Debounce so we only paint once the new
		// profile has settled (each appearing key reschedules the repaint).
		this.ensureTimer();
		this.scheduleRefresh();
	}

	override onWillDisappear(): void {
		// Same debounce when leaving — render the page we switched TO once it settles. The timer keeps
		// running for the plugin's lifetime (refresh early-returns cheaply when nothing is visible).
		this.scheduleRefresh();
	}

	private scheduleRefresh(): void {
		clearTimeout(this.debounce);
		this.debounce = setTimeout(() => void this.refresh(), 130);
	}

	override async onKeyDown(ev: KeyDownEvent): Promise<void> {
		// Position of the pressed key among this action's keys on the same device.
		const keys = orderedKeysOnDevice(this.actions, ev.action.device.id);
		const i = keys.findIndex((k) => k.id === ev.action.id);
		if (i < 0) return;

		// A lone key is a status widget — tapping opens the full Claude Sessions deck (all sessions).
		if (keys.length === 1) {
			await switchProfile(ev.action, DECK_PROFILE);
			return;
		}

		// In the deck, the first key is the "‹ Summary" control — go back to the previous profile.
		if (i === 0) {
			await switchProfile(ev.action, undefined);
			return;
		}

		// Otherwise it is a session key — open its terminal tab or desktop task.
		// Use the task painted on this key; a fresh scan can reorder sessions during a press.
		const target = this.displayedSessions.get(ev.action.id);
		if (!target) {
			await ev.action.showAlert();
			return;
		}
		try {
			const live = await scanSessions();
			if (!live.some((s) => s.id === target.id)) {
				await ev.action.showAlert();
				return;
			}
			if (target.source === "desktop" && target.threadId) {
				await pexec(OPEN, [codexTaskUrl(target.threadId)]);
			} else if (!await focusTty(target.tty)) await ev.action.showAlert();
		} catch (err) {
			streamDeck.logger.error(`focus failed for ${target.id}: ${err}`);
			await ev.action.showAlert();
		}
	}

	/** The property inspector polls for status (version is read by the PI from its connection info). */
	override async onSendToPlugin(): Promise<void> {
		await streamDeck.ui.sendToPropertyInspector(await pluginStatus());
	}

	private ensureTimer(): void {
		if (this.timer) return;
		this.timer = setInterval(() => void this.refresh(), REFRESH_MS);
	}

	private async refresh(): Promise<void> {
		if (this.refreshing) return;
		this.refreshing = true;
		try { await this.refreshKeys(); }
		finally { this.refreshing = false; }
	}

	private async refreshKeys(): Promise<void> {
		// Group this action's visible keys by device, each sorted into reading order.
		const groups = keysByDevice(this.actions);
		if (groups.size === 0) return; // not shown anywhere — skip the scan entirely

		let sessions: Session[] = [];
		try {
			sessions = await scanSessions();
		} catch (err) {
			streamDeck.logger.error(`scan failed: ${err}`);
		}

		const totalKeys = [...groups.values()].reduce((n, k) => n + k.length, 0);
		const summary = sessions.map((s) => `${s.provider}/${s.source}:${s.project}/${s.detail}[${s.status}]`).join(", ");
		const signature = `${totalKeys}|${summary}`;
		if (signature !== this.lastSignature) {
			streamDeck.logger.info(`${totalKeys} key(s), ${sessions.length} session(s): ${summary}`);
			this.lastSignature = signature;
		}

		const visibleIds = new Set([...groups.values()].flat().map((key) => key.id));
		for (const id of this.displayedSessions.keys()) if (!visibleIds.has(id)) this.displayedSessions.delete(id);
		for (const keys of groups.values()) {
			// A single key on its own is a standalone summary/status widget; otherwise it's the deck.
			const solo = keys.length === 1;
			for (let i = 0; i < keys.length; i++) {
				try {
					await keys[i].setTitle("");
					await keys[i].setImage(toDataUri(solo ? renderSummary(sessions) : renderForIndex(i, sessions)));
					const session = !solo && i > 0 ? sessions[i - 1] : undefined;
					if (session) this.displayedSessions.set(keys[i].id, session);
					else this.displayedSessions.delete(keys[i].id);
				} catch (err) {
					streamDeck.logger.error(`setImage failed (key ${i}): ${err}`);
				}
			}
		}
	}
}

/** In the deck: key 0 is the "‹ Summary" control (back to previous profile); the rest are sessions. */
function renderForIndex(i: number, sessions: Session[]): string {
	if (i === 0) return renderControl(sessions);
	return renderSvg(sessions[i - 1]);
}

/** Switch the device's profile (to {@link profile}, or back to the previous one when undefined). */
async function switchProfile(action: { device: { id: string }; showAlert(): Promise<void> }, profile?: string): Promise<void> {
	try {
		await streamDeck.profiles.switchToProfile(action.device.id, profile);
	} catch (err) {
		streamDeck.logger.error(`switchToProfile(${profile ?? "previous"}) failed: ${err}`);
		await action.showAlert();
	}
}

/** Stream Deck's setImage is most reliable with a base64-encoded data URI. */
function toDataUri(svg: string): string {
	return `data:image/svg+xml;base64,${Buffer.from(svg, "utf-8").toString("base64")}`;
}

/** This action's visible keys, grouped by device id, each sorted by row then column (reading order). */
function keysByDevice(actions: Iterable<{ isKey(): boolean }>): Map<string, KeyAction[]> {
	const groups = new Map<string, KeyAction[]>();
	for (const a of actions) {
		if (!a.isKey()) continue;
		const key = a as unknown as KeyAction;
		const c = key.coordinates;
		if (!c) continue; // e.g. part of a multi-action
		const list = groups.get(key.device.id) ?? [];
		list.push(key);
		groups.set(key.device.id, list);
	}
	for (const list of groups.values()) {
		list.sort((x, y) => x.coordinates!.row - y.coordinates!.row || x.coordinates!.column - y.coordinates!.column);
	}
	return groups;
}

/** Convenience for {@link onKeyDown}: this action's keys on one device, in reading order. */
function orderedKeysOnDevice(actions: Iterable<{ isKey(): boolean }>, deviceId: string): KeyAction[] {
	return keysByDevice(actions).get(deviceId) ?? [];
}

/** The PI only needs iTerm2 automation when CLI sessions are present. */
async function pluginStatus(): Promise<{ sessions: number; claude: number; codexCli: number; codexDesktop: number; itermOk: boolean; error?: string }> {
	try {
		const sessions = await scanSessions();
		const cli = sessions.filter((s) => s.source === "cli");
		const iterm = cli.length ? await getItermSessions() : new Map();
		return {
			sessions: sessions.length,
			claude: sessions.filter((s) => s.provider === "claude").length,
			codexCli: sessions.filter((s) => s.provider === "codex" && s.source === "cli").length,
			codexDesktop: sessions.filter((s) => s.source === "desktop").length,
			itermOk: !cli.length || cli.every((s) => iterm.has(s.tty)),
		};
	} catch {
		return { sessions: 0, claude: 0, codexCli: 0, codexDesktop: 0, itermOk: false, error: "Session scan failed; check plugin logs." };
	}
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
	working: { color: "#f5a623", label: "working" }, // amber — an agent turn is in progress
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
<text x="72" y="32" font-family="${FONT}" font-weight="600" font-size="12" fill="${s.provider === "codex" ? "#8ee3ce" : "#d9a58c"}" text-anchor="middle">${s.provider === "claude" ? "CLAUDE" : s.source === "desktop" ? "CODEX APP" : "CODEX CLI"}</text>
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
<text x="72" y="34" font-family="${FONT}" font-weight="700" font-size="20" fill="#ffffff" text-anchor="middle">${sessions.length} sessions</text>
${row(60, "working", c.working)}
${row(86, "waiting", c.waiting)}
${row(112, "idle", c.idle)}
<text x="72" y="135" font-family="${FONT}" font-weight="600" font-size="13" fill="#6f9bd6" text-anchor="middle">▸ show all</text>
</svg>`;
}

/** The deck's first key — "‹ Summary": returns to the previous profile. Badges the count needing you. */
function renderControl(sessions: Session[]): string {
	const W = 144;
	const H = 144;
	const needYou = countByStatus(sessions).waiting;
	const badge =
		needYou > 0
			? `<circle cx="118" cy="26" r="13" fill="${STATUS_THEME.waiting.color}"/>` +
				`<text x="118" y="32" font-family="${FONT}" font-weight="700" font-size="17" fill="#06281a" text-anchor="middle">${needYou}</text>`
			: "";
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<rect width="${W}" height="${H}" rx="16" fill="#1b2433"/>
<rect width="${W}" height="11" fill="#3d6fb0"/>
<text x="72" y="86" font-family="${FONT}" font-weight="700" font-size="44" fill="#9fc1ee" text-anchor="middle">‹</text>
<text x="72" y="118" font-family="${FONT}" font-weight="600" font-size="17" fill="#cdd9e8" text-anchor="middle">Summary</text>
${badge}
</svg>`;
}
