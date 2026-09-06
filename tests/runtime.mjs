import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

export const directory = mkdtempSync(join(tmpdir(), "streamdeck-tests-"));
process.on("exit", () => rmSync(directory, { recursive: true, force: true }));
for (const name of ["sessions", "codex", "scanner"]) {
	const source = readFileSync(new URL(`../src/${name}.ts`, import.meta.url), "utf8");
	const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } });
	writeFileSync(join(directory, `${name}.mjs`), outputText.replace(/from "\.\/(sessions|codex)"/g, 'from "./$1.mjs"'));
}
export const sessions = await import(pathToFileURL(join(directory, "sessions.mjs")));
export const codex = await import(pathToFileURL(join(directory, "codex.mjs")));

export const scanner = await import(pathToFileURL(join(directory, "scanner.mjs")));
