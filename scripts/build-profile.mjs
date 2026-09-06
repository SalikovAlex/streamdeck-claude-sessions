#!/usr/bin/env node
/**
 * Generates "Claude Sessions.streamDeckProfile" — an importable Stream Deck profile bundle
 * with 8 keys (Stream Deck +, 2 rows x 4 cols) each bound to the com.salikov.claude-sessions.slot
 * action. The Stream Deck app converts this import format into its own native profile on install,
 * so we don't have to author the app's on-disk format directly.
 *
 * Format mirrors a known-good importer (jeremydaly/deck-commander): a zip containing
 *   package.json
 *   Profiles/<PROFILE_UUID>.sdProfile/manifest.json
 *   Profiles/<PROFILE_UUID>.sdProfile/Profiles/<PAGE_UUID upper>/manifest.json
 */
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const pluginDir = path.join(rootDir, "com.salikov.claude-sessions.sdPlugin");
const pluginManifest = JSON.parse(fs.readFileSync(path.join(pluginDir, "manifest.json"), "utf-8"));

const PROFILE_NAME = "Claude Sessions";
const ACTION_UUID = "com.salikov.claude-sessions.slot";
const PLUGIN_UUID = "com.salikov.claude-sessions";

// The user's actual Stream Deck + (copied verbatim from their existing SD+ profile).
const DEVICE = { Model: "20GBD9901", UUID: "" };
// Stream Deck +: 4 columns x 2 rows of keys.
const COLS = 4;
const ROWS = 2;

function slotAction() {
	return {
		ActionID: randomUUID().toUpperCase(),
		LinkedTitle: true,
		Name: pluginManifest.Actions[0].Name,
		Plugin: {
			Name: pluginManifest.Name,
			UUID: PLUGIN_UUID,
			Version: pluginManifest.Version,
		},
		Resources: null,
		Settings: {},
		State: 0,
		States: [
			{
				FontFamily: "",
				FontSize: 12,
				FontStyle: "",
				FontUnderline: false,
				OutlineThickness: 2,
				ShowTitle: false,
				Title: "",
				TitleAlignment: "middle",
				TitleColor: "#ffffff",
			},
		],
		UUID: ACTION_UUID,
	};
}

function buildKeypadActions() {
	const actions = {};
	for (let row = 0; row < ROWS; row++) {
		for (let col = 0; col < COLS; col++) {
			actions[`${col},${row}`] = slotAction();
		}
	}
	return actions;
}

const pageUuid = randomUUID();
const profileUuid = randomUUID().toUpperCase();

const packageJson = {
	AppVersion: "7.4.2.0",
	DeviceModel: DEVICE.Model,
	DeviceSettings: null,
	FormatVersion: 1,
	OSType: "macOS",
	OSVersion: "26.0",
	RequiredPlugins: [PLUGIN_UUID],
};

const topManifest = {
	Device: DEVICE,
	Name: PROFILE_NAME,
	Pages: {
		Current: "00000000-0000-0000-0000-000000000000",
		Default: pageUuid,
		Pages: [pageUuid],
	},
	Version: "3.0",
};

const pageManifest = {
	Controllers: [
		{ Actions: buildKeypadActions(), Type: "Keypad" },
		{ Actions: null, Type: "Encoder" },
	],
	Icon: "",
	Name: "",
};

// Lay out the temp tree, then zip it into <name>.streamDeckProfile.
const tempDir = path.join(rootDir, ".profile-build");
const profileDir = path.join(tempDir, "Profiles", `${profileUuid}.sdProfile`);
const pageDir = path.join(profileDir, "Profiles", pageUuid.toUpperCase());
fs.rmSync(tempDir, { recursive: true, force: true });
fs.mkdirSync(path.join(pageDir, "Images"), { recursive: true });
fs.mkdirSync(path.join(profileDir, "Images"), { recursive: true });

fs.writeFileSync(path.join(tempDir, "package.json"), JSON.stringify(packageJson));
fs.writeFileSync(path.join(profileDir, "manifest.json"), JSON.stringify(topManifest));
fs.writeFileSync(path.join(pageDir, "manifest.json"), JSON.stringify(pageManifest));

const outputFile = path.join(pluginDir, `${PROFILE_NAME}.streamDeckProfile`);
fs.rmSync(outputFile, { force: true });
execSync(`zip -r -X "${outputFile}" package.json Profiles`, { cwd: tempDir, stdio: "pipe" });
fs.rmSync(tempDir, { recursive: true, force: true });

console.log(`Wrote ${outputFile}`);
console.log(`  profile=${profileUuid} page=${pageUuid} keys=${COLS * ROWS} device=${DEVICE.Model}`);
