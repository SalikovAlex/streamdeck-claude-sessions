import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { codex as c } from "./runtime.mjs";

const id = "01a07889-6539-7010-a42b-51c3b91f22e2";
const other = "01a0788a-a854-72b1-ac71-1e46b4a854a6";

test("live references deduplicate lock/rollout files and respect a custom Codex home", () => {
	const rollout = `/Users/me/My Codex/sessions/2026/09/06/rollout-2026-09-06T22-04-25-${id}.jsonl`;
	assert.deepEqual(c.codexReferences([
		`/Users/me/My Codex/thread-writer-locks/${id}.lock`, rollout,
		"/Users/me/My Codex/thread-writer-locks/.coordination.lock",
		"/Users/me/My Codex/state_5.sqlite",
	]), [{ id, home: "/Users/me/My Codex", rollout }]);
});

test("Codex lifecycle state ignores user content and tool output", () => {
	assert.equal(c.rolloutStatus([{ type: "event_msg", payload: { type: "task_started" } }]), "working");
	assert.equal(c.rolloutStatus([
		{ type: "event_msg", payload: { type: "task_started" } },
		{ type: "event_msg", payload: { type: "task_complete" } },
		{ type: "response_item", payload: { type: "function_call_output", output: "task_started" } },
	]), "waiting");
	assert.equal(c.rolloutStatus([{ type: "response_item", payload: { type: "message", role: "user", content: "task_complete" } }]), undefined);
	assert.equal(c.turnStatus("inProgress"), "working");
	assert.equal(c.turnStatus("interrupted"), "waiting");
	assert.equal(c.turnStatus("unknown"), undefined);
});

test("desktop task links validate the ID", () => {
	assert.equal(c.codexTaskUrl(id), `codex://threads/${id}`);
	assert.throws(() => c.codexTaskUrl("../../settings"));
});

test("legacy rollout fallback tolerates truncated writes and filters subagents", async (t) => {
	const home = await mkdtemp(join(tmpdir(), "streamdeck-codex-"));
	t.after(() => rm(home, { recursive: true, force: true }));
	const dir = join(home, "sessions/2026/09/06");
	await mkdir(dir, { recursive: true });
	const rollout = join(dir, `rollout-date-${id}.jsonl`);
	const child = join(dir, `rollout-date-${other}.jsonl`);
	const jsonl = (rows) => rows.map((r) => JSON.stringify(r)).join("\n") + "\n";
	await writeFile(rollout, jsonl([
		{ type: "session_meta", payload: { id, cwd: "/tmp/project", source: "vscode" } },
		{ type: "event_msg", payload: { type: "task_started" } },
		{ type: "response_item", payload: { type: "function_call_output", output: "x".repeat(300000) } },
		{ type: "event_msg", payload: { type: "task_complete" } },
	]) + '{"type":');
	await writeFile(child, jsonl([{ type: "session_meta", payload: { id: other, cwd: "/tmp/project", source: { subagent: "guardian" } } }]));
	const result = await c.readCodexThreads(c.codexReferences([rollout, child]));
	assert.deepEqual([...result.values()], [{ id, cwd: "/tmp/project", title: "", status: "waiting" }]);
});

test("read-only SQLite uses latest turn, excludes archived tasks and preserves database", { skip: process.platform !== "darwin" }, async (t) => {
	const home = await mkdtemp(join(tmpdir(), "streamdeck-codex-db-"));
	t.after(() => rm(home, { recursive: true, force: true }));
	const db = join(home, "state_5.sqlite");
	const history = join(home, "thread_history_1.sqlite");
	execFileSync("/usr/bin/sqlite3", [db, `CREATE TABLE threads (id TEXT,cwd TEXT,title TEXT,source TEXT,archived INTEGER,rollout_path TEXT); INSERT INTO threads VALUES ('${id}','/tmp/project','Build support','vscode',0,''),('${other}','/tmp/old','Old task','vscode',1,'');`]);
	execFileSync("/usr/bin/sqlite3", [history, `CREATE TABLE thread_turns (thread_id TEXT,status TEXT,rollout_ordinal INTEGER); INSERT INTO thread_turns VALUES ('${id}','completed',1),('${id}','inProgress',2);`]);
	const result = await c.readCodexThreads([{ id, home }, { id: other, home }]);
	assert.deepEqual([...result.values()], [{ id, cwd: "/tmp/project", title: "Build support", status: "working" }]);
	assert.equal(execFileSync("/usr/bin/sqlite3", [db, "SELECT COUNT(*) FROM threads;"], { encoding: "utf8" }).trim(), "2");
});

test("newer Codex uses the displayed task name instead of the original prompt", { skip: process.platform !== "darwin" }, async (t) => {
	const home = await mkdtemp(join(tmpdir(), "streamdeck-codex-name-"));
	t.after(() => rm(home, { recursive: true, force: true }));
	execFileSync("/usr/bin/sqlite3", [join(home, "state_5.sqlite"), `CREATE TABLE threads (id TEXT,cwd TEXT,title TEXT,name TEXT,source TEXT,archived INTEGER,rollout_path TEXT); INSERT INTO threads VALUES ('${id}','/tmp/project','Long original user prompt','Task name','vscode',0,''),('${other}','/tmp/old','Unloaded task',NULL,'vscode',0,'');`]);
	const result = await c.readCodexThreads([{ id, home }]);
	assert.deepEqual([...result.values()], [{ id, cwd: "/tmp/project", title: "Task name", status: undefined }]);
});

test("missing session files are isolated without creating Codex databases", async () => {
	const result = await c.readCodexThreads([{ id, home: "/nonexistent-codex-home", rollout: "/missing.jsonl" }]);
	assert.equal(result.size, 0);
});
