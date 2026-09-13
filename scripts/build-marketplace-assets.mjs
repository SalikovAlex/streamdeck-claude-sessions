#!/usr/bin/env node
/**
 * Generates Elgato Marketplace listing assets into ./marketplace:
 *   icon.png            288x288   (1:1)
 *   thumbnail.png       1920x960  (2:1)
 *   gallery-1-detail.png    1920x960
 *   gallery-2-summary.png   1920x960
 *   gallery-3-status.png    1920x960
 *
 * SVG is authored here, rasterised with macOS Quick Look (qlmanage), sized exactly with sips.
 */
import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "marketplace");
fs.mkdirSync(OUT, { recursive: true });

const BG = "#0b111c";
const PANEL = "#0e1726";
const AMBER = "#f5a623"; // working
const GREEN = "#2ec27e"; // your turn
const GREY = "#6b7280"; // idle
const BLUE = "#3d6fb0"; // control accent
const FONT = "Helvetica Neue, Helvetica, Arial, sans-serif";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const trunc = (s, n) => (s.length <= n ? s : s.slice(0, n - 1) + "…");

/** The brand mark: terminal prompt ">" + cursor + three status dots. Drawn in a 512 box. */
function logoMark() {
	return `
<path d="M150 168 L256 256 L150 344" fill="none" stroke="#e6edf5" stroke-width="42" stroke-linecap="round" stroke-linejoin="round"/>
<rect x="286" y="320" width="116" height="36" rx="18" fill="#46586e"/>
<circle cx="170" cy="410" r="28" fill="${AMBER}"/>
<circle cx="256" cy="410" r="28" fill="${GREEN}"/>
<circle cx="342" cy="410" r="28" fill="${GREY}"/>`;
}

/** One Stream Deck key, drawn in a 300x300 box (origin 0,0). Pass a "kind". */
function keyBody(opts) {
	const { kind } = opts;
	const W = 300;
	if (kind === "empty") {
		return `<rect width="${W}" height="${W}" rx="34" fill="#11151b"/>
<circle cx="150" cy="128" r="10" fill="#2b3038"/>
<text x="150" y="205" font-family="${FONT}" font-size="32" fill="#3a3f45" text-anchor="middle">empty</text>`;
	}
	if (kind === "summary") {
		const { working, waiting, idle } = opts;
		const total = working + waiting + idle;
		const accent = waiting > 0 ? GREEN : working > 0 ? AMBER : GREY;
		const row = (y, color, n, label) =>
			`<circle cx="46" cy="${y - 10}" r="11" fill="${color}"/><text x="70" y="${y}" font-family="${FONT}" font-size="33" fill="#cdd9e8">${n} ${label}</text>`;
		return `<rect width="${W}" height="${W}" rx="34" fill="${PANEL}"/>
<rect width="${W}" height="22" rx="0" fill="${accent}"/>
<text x="150" y="80" font-family="${FONT}" font-weight="700" font-size="40" fill="#ffffff" text-anchor="middle">${total} Claude</text>
${row(140, AMBER, working, "working")}
${row(192, GREEN, waiting, "your turn")}
${row(244, GREY, idle, "idle")}`;
	}
	if (kind === "control") {
		const { needYou } = opts;
		const badge =
			needYou > 0
				? `<circle cx="246" cy="56" r="26" fill="${GREEN}"/><text x="246" y="68" font-family="${FONT}" font-weight="700" font-size="34" fill="#06281a" text-anchor="middle">${needYou}</text>`
				: "";
		return `<rect width="${W}" height="${W}" rx="34" fill="#1b2433"/>
<rect width="${W}" height="22" fill="${BLUE}"/>
<text x="150" y="186" font-family="${FONT}" font-weight="700" font-size="120" fill="#9fc1ee" text-anchor="middle">‹</text>
<text x="150" y="248" font-family="${FONT}" font-weight="600" font-size="34" fill="#cdd9e8" text-anchor="middle">Summary</text>
${badge}`;
	}
	// session key
	const { project, label, status } = opts;
	const color = status === "working" ? AMBER : status === "waiting" ? GREEN : GREY;
	const statusLabel = status === "working" ? "working" : status === "waiting" ? "your turn" : "idle";
	return `<rect width="${W}" height="${W}" rx="34" fill="${PANEL}"/>
<rect width="${W}" height="22" fill="${color}"/>
<text x="150" y="130" font-family="${FONT}" font-weight="700" font-size="50" fill="#ffffff" text-anchor="middle">${esc(trunc(project, 11))}</text>
<text x="150" y="184" font-family="${FONT}" font-size="33" fill="#9fb3cc" text-anchor="middle">${esc(trunc(label, 14))}</text>
<circle cx="84" cy="245" r="12" fill="${color}"/>
<text x="108" y="256" font-family="${FONT}" font-weight="600" font-size="33" fill="${color}" text-anchor="start">${statusLabel}</text>`;
}

function keyAt(x, y, scale, opts) {
	return `<g transform="translate(${x},${y}) scale(${scale})">${keyBody(opts)}</g>`;
}

/** A 4x2 deck grid centred at gx,gy. keys = array of 8 opts (row-major). */
function deck(gx, gy, scale, keys) {
	const KW = 300 * scale;
	const gap = 26 * scale;
	let out = "";
	for (let i = 0; i < 8; i++) {
		const col = i % 4;
		const rowi = Math.floor(i / 4);
		out += keyAt(gx + col * (KW + gap), gy + rowi * (KW + gap), scale, keys[i] ?? { kind: "empty" });
	}
	return out;
}

const detailKeys = [
	{ kind: "control", needYou: 4 },
	{ kind: "session", project: "product", label: "dwh", status: "waiting" },
	{ kind: "session", project: "product", label: "vision-serverless", status: "working" },
	{ kind: "session", project: "marketplace", label: "e2eprmkt", status: "waiting" },
	{ kind: "session", project: "product", label: "Query DWH for…", status: "waiting" },
	{ kind: "session", project: "skypilot", label: "tenants", status: "working" },
	{ kind: "session", project: "product", label: "web analytics", status: "waiting" },
	{ kind: "session", project: "product", label: "Commit & push", status: "waiting" },
];
const summaryKeys = [
	{ kind: "summary", working: 2, waiting: 4, idle: 1 },
	{ kind: "empty" }, { kind: "empty" }, { kind: "empty" },
	{ kind: "empty" }, { kind: "empty" }, { kind: "empty" }, { kind: "empty" },
];

function svgDoc(w, h, inner) {
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0d1420"/><stop offset="1" stop-color="#080c14"/></linearGradient></defs>
<rect width="${w}" height="${h}" fill="url(#bg)"/>
${inner}</svg>`;
}

function title(w, y, text, size = 64, color = "#ffffff", weight = 700) {
	return `<text x="${w / 2}" y="${y}" font-family="${FONT}" font-weight="${weight}" font-size="${size}" fill="${color}" text-anchor="middle">${esc(text)}</text>`;
}

// ---- ICON 288 (reuse the master mark on a square) ----
const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="288" height="288" viewBox="0 0 512 512"><rect width="512" height="512" fill="${PANEL}"/>${logoMark()}</svg>`;

// ---- THUMBNAIL 1920x960: logo + title + subtitle + a row of sample keys ----
const thumbInner2 = `
<g transform="translate(120,116) scale(0.5)">${logoMark()}</g>
${title(1920, 258, "Claude Sessions", 112)}
${title(1920, 330, "See & switch your Claude Code sessions — right from the Stream Deck", 40, "#9fb3cc", 500)}
${title(1920, 380, "Unofficial · macOS + iTerm2", 30, "#5f7a99", 500)}
<g transform="translate(437,470)">
${keyAt(0, 0, 0.66, { kind: "control", needYou: 4 })}
${keyAt(214, 0, 0.66, { kind: "session", project: "product", label: "dwh", status: "waiting" })}
${keyAt(428, 0, 0.66, { kind: "session", project: "skypilot", label: "tenants", status: "working" })}
${keyAt(642, 0, 0.66, { kind: "session", project: "marketplace", label: "e2eprmkt", status: "waiting" })}
${keyAt(856, 0, 0.66, { kind: "session", project: "claude-sessions", label: "Stream Deck", status: "working" })}
</g>`;

// ---- GALLERY 1: detail view ----
const g1 = `${title(1920, 110, "Every session — one press to its iTerm2 tab", 56)}
${deck(324, 200, 0.95, detailKeys)}`;

// ---- GALLERY 2: summary view (lone key on any profile) ----
const g2 = `${title(1920, 110, "Aggregated summary on a lone key", 56)}
${deck(324, 200, 0.95, summaryKeys)}
${title(1920, 880, "Tap to open the bundled Claude Sessions deck", 34, "#9fb3cc", 500)}`;

// ---- GALLERY 3: status legend ----
const g3 = `${title(1920, 130, "Live status for every session", 60)}
<g transform="translate(360,260)">
${keyAt(0, 0, 1.15, { kind: "session", project: "product", label: "thinking…", status: "working" })}
${keyAt(420, 0, 1.15, { kind: "session", project: "dwh", label: "asks you", status: "waiting" })}
${keyAt(840, 0, 1.15, { kind: "session", project: "idle one", label: "—", status: "idle" })}
</g>
${title(1920, 800, "amber = working   ·   green = your turn (question / done)   ·   grey = idle", 36, "#9fb3cc", 500)}
${title(1920, 858, "Press a key to jump straight to that Claude session", 34, "#7f93ad", 500)}`;

// ---- render helper (Chrome headless — honours SVG text-anchor, gradients, fonts) ----
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
function render(name, svg, w, h) {
	const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mkt-"));
	const html = `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0}svg{display:block}</style></head><body>${svg}</body></html>`;
	const htmlPath = path.join(tmp, "a.html");
	fs.writeFileSync(htmlPath, html);
	const outPath = path.join(OUT, name);
	try {
		execSync(
			`"${CHROME}" --headless=new --disable-gpu --no-sandbox --disable-dev-shm-usage --no-first-run --hide-scrollbars ` +
				`--force-device-scale-factor=1 --virtual-time-budget=3000 --user-data-dir="${tmp}/cd" ` +
				`--window-size=${w},${h} --screenshot="${outPath}" "file://${htmlPath}"`,
			{ stdio: "ignore", timeout: 15000, killSignal: "SIGKILL" },
		);
	} catch {
		// Chrome occasionally doesn't exit after --screenshot; the PNG is written regardless.
	}
	if (!fs.existsSync(outPath)) throw new Error(`chrome failed for ${name}`);
	// guarantee exact dimensions
	execSync(`sips -z ${h} ${w} "${outPath}"`, { stdio: "ignore" });
	fs.rmSync(tmp, { recursive: true, force: true });
	const dims = execSync(`sips -g pixelWidth -g pixelHeight "${outPath}"`).toString().match(/\d+/g);
	console.log(`  ${name}  ${dims?.slice(-2).join("x")}`);
}

render("icon.png", iconSvg, 288, 288);
render("thumbnail.png", svgDoc(1920, 960, thumbInner2), 1920, 960);
render("gallery-1-detail.png", svgDoc(1920, 960, g1), 1920, 960);
render("gallery-2-summary.png", svgDoc(1920, 960, g2), 1920, 960);
render("gallery-3-status.png", svgDoc(1920, 960, g3), 1920, 960);
console.log(`Assets written to ${OUT}`);
