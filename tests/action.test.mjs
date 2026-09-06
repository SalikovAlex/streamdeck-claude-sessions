import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import ts from "typescript";
import { directory } from "./runtime.mjs";

// Exercise the real action with a simulated SDK and OS boundary; never switch the user's apps.
writeFileSync(join(directory, "action-boundary.mjs"), `
import { promisify } from 'node:util';
export const state = { sessions: [], commands: [], profiles: [], itermCalls: 0 };
export const createScanner = () => async () => state.sessions;
export const getItermSessions = async () => { state.itermCalls++; return new Map(); };
export const execFile = Object.assign(() => {}, { [promisify.custom]: async (file, args) => {
	state.commands.push({ file, args }); return { stdout: 'ok' };
} });
export const action = () => (target) => target;
export class SingletonAction { actions = []; }
export default { logger: { debug() {}, info() {}, error() {} },
	profiles: { async switchToProfile(device, profile) { state.profiles.push(profile); } },
	ui: { async sendToPropertyInspector(value) { state.inspector = value; } }
};
`);
const source = readFileSync(new URL("../src/actions/session.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } });
writeFileSync(join(directory, "action.mjs"), outputText
	.replace(/from "(?:@elgato\/streamdeck|node:child_process|\.\.\/scanner)"/g, 'from "./action-boundary.mjs"')
	.replace(/from "\.\.\/(codex|sessions)"/g, 'from "./$1.mjs"'));
const { SessionSlot } = await import(pathToFileURL(join(directory, "action.mjs")));
const { state } = await import(pathToFileURL(join(directory, "action-boundary.mjs")));
const id = "01a07889-6539-7010-a42b-51c3b91f22e2";
const desktop = { id: `codex:desktop:${id}`, provider: "codex", source: "desktop", pid: 20, tty: "", cwd: "/tmp/project", project: "project", detail: "Task title", status: "working", threadId: id };
const cli = { id: "claude:cli:10", provider: "claude", source: "cli", pid: 10, tty: "/dev/ttys003", cwd: "/tmp/claude", project: "claude", detail: "Fix & test", status: "waiting" };

function key(id, column) {
	return { id, coordinates: { row: 1, column }, device: { id: "deck" }, isKey: () => true,
		async setTitle() {}, async setImage(image) { this.svg = Buffer.from(image.split(",")[1], "base64").toString(); },
		async showAlert() { this.alerts = (this.alerts ?? 0) + 1; } };
}
function setup(sessions, count = 3) {
	state.sessions = sessions; state.commands = []; state.profiles = []; state.itermCalls = 0;
	const action = new SessionSlot();
	action.actions = Array.from({ length: count }, (_, i) => key(`key-${i}`, i + 1));
	return action;
}

test("desktop key opens the displayed task when a fresh scan reorders the list", async () => {
	const action = setup([desktop, cli]);
	await action.refresh();
	assert.match(action.actions[1].svg, /CODEX APP/);
	assert.match(action.actions[2].svg, /CLAUDE/);
	assert.match(action.actions[2].svg, /Fix &amp; test/);
	state.sessions = [cli, desktop];
	await action.onKeyDown({ action: action.actions[1] });
	assert.deepEqual(state.commands, [{ file: "/usr/bin/open", args: [`codex://threads/${id}`] }]);
});

test("an exited task alerts instead of opening the replacement in its slot", async () => {
	const action = setup([desktop, cli]);
	await action.refresh();
	state.sessions = [cli];
	await action.onKeyDown({ action: action.actions[1] });
	assert.equal(action.actions[1].alerts, 1);
	assert.deepEqual(state.commands, []);
});

test("CLI keys focus their iTerm2 TTY", async () => {
	const action = setup([cli]);
	await action.refresh();
	await action.onKeyDown({ action: action.actions[1] });
	assert.equal(state.commands[0].file, "/usr/bin/osascript");
	assert.equal(state.commands[0].args.at(-1), "/dev/ttys003");
});

test("single-key summary and back control preserve the installed profile name", async () => {
	const action = setup([desktop, cli], 1);
	await action.refresh();
	assert.match(action.actions[0].svg, /2 sessions/);
	await action.onKeyDown({ action: action.actions[0] });
	assert.deepEqual(state.profiles, ["Claude Sessions"]);
	const deck = setup([desktop, cli]);
	await deck.onKeyDown({ action: deck.actions[0] });
	assert.deepEqual(state.profiles, [undefined]);
});

test("desktop-only inspector counts work without iTerm2 Automation", async () => {
	const action = setup([desktop]);
	await action.onSendToPlugin();
	assert.equal(state.itermCalls, 0);
	assert.deepEqual(state.inspector, { sessions: 1, claude: 0, codexCli: 0, codexDesktop: 1, itermOk: true });
});
