import assert from "node:assert/strict";
import test from "node:test";
import { sessions as s } from "./runtime.mjs";

test("mixed Claude, native Codex, npm Codex and desktop processes; exclude service commands", () => {
	const procs = s.parseProcesses(`
100 1 s001 /bin/zsh
101 100 s001 claude --resume work
200 1 s002 /bin/zsh
201 200 s002 node /opt/lib/node_modules/@openai/codex/bin/codex.js --model test
202 201 s002 /opt/lib/node_modules/@openai/codex/vendor/aarch64-apple-darwin/codex/codex --model test
300 1 ?? /Applications/Codex.app/Contents/Resources/codex app-server --analytics-default-enabled
301 1 ?? /Volumes/My Disk/ChatGPT.app/Contents/Resources/codex -c features.foo=true app-server
400 1 ?? /Users/me/.vscode/bin/codex app-server
401 100 s001 codex mcp-server
402 100 s001 codex -c model=test exec do-something
403 100 s001 codex --version
404 1 ?? codex
405 100 s001 echo codex
406 100 s001 codex-code-mode-host
500 200 s002 /opt/bin/codex resume --last
501 200 s003 codex -c model=test "fix the app-server config"
502 200 s004 /Volumes/My Disk/Codex.app/Contents/Resources/codex "fix the app-server config"
`);
	assert.deepEqual(s.detectAgents(procs).map((a) => [a.proc.pid, a.provider, a.source]), [
		[101, "claude", "cli"], [202, "codex", "cli"], [300, "codex", "desktop"], [301, "codex", "desktop"], [500, "codex", "cli"], [501, "codex", "cli"], [502, "codex", "cli"],
	]);
});

test("qterm ancestry still resolves to the owning iTerm2 tty", () => {
	const procs = s.parseProcesses("10 1 s003 /bin/zsh\n11 10 s099 /bin/zsh\n12 11 s099 codex");
	assert.equal(s.resolveTerminalTty(12, procs, new Set(["/dev/ttys003"])), "/dev/ttys003");
	assert.equal(s.resolveTerminalTty(12, procs, new Set()), "/dev/ttys099");
	assert.equal(s.normalizeTty("??"), "");
});

test("process ancestry cycles are bounded", () => {
	const procs = s.parseProcesses("10 11 s001 codex\n11 10 s001 /bin/zsh");
	assert.equal(s.resolveTerminalTty(10, procs, new Set()), "/dev/ttys001");
});

test("provider-specific labels do not confuse Codex -c config with Claude continue", () => {
	assert.equal(s.detailFromArgs('claude --resume "release plan"', "claude"), "release plan");
	assert.equal(s.detailFromArgs("claude -c", "claude"), "continue");
	assert.equal(s.detailFromArgs("codex -c model=test", "codex"), "");
	assert.equal(s.detailFromArgs('codex -c model=test resume "release plan"', "codex"), "release plan");
	assert.equal(s.detailFromArgs("codex resume 01a07889-6539-7010-a42b-51c3b91f22e2", "codex"), "");
	assert.equal(s.detailFromArgs("codex resume --last", "codex"), "");
});

test("Claude tab status remains intact; Codex does not inherit a stale Claude waiting glyph", () => {
	assert.equal(s.statusFromTab({ name: "⠋ Working", processing: false }, "claude"), "working");
	assert.equal(s.statusFromTab({ name: "✳ Ready", processing: true }, "claude"), "waiting");
	assert.equal(s.statusFromTab({ name: "✳ Old title", processing: false }, "codex"), "idle");
	assert.equal(s.statusFromTab({ name: "Codex", processing: true }, "codex"), "working");
	assert.equal(s.statusFromTab(undefined, "codex"), "idle");
	assert.equal(s.cleanTabName("⠋ Fix & test (codex)"), "Fix & test");
});

test("lsof preserves multiple paths, whitespace, and repeated process sections", () => {
	assert.deepEqual([...s.parseLsof("p12\nn/Users/me/My Project\np13\nn/tmp\np12\nn/Users/me/.codex/sessions/a.jsonl")], [
		[12, ["/Users/me/My Project", "/Users/me/.codex/sessions/a.jsonl"]], [13, ["/tmp"]],
	]);
});
