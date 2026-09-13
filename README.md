# Claude Sessions — Stream Deck + plugin

Shows your running **Claude Code** sessions on the Stream Deck + keys, and **jumps to the matching iTerm2 tab** when you press a key.

> **Unofficial / community project.** Not affiliated with, sponsored, or endorsed by Anthropic.
> "Claude" and "Claude Code" are trademarks of Anthropic. **Requires macOS + iTerm2 + a Stream Deck +.**

## Install (users)

1. Download the latest `com.salikov.claude-sessions.streamDeckPlugin` from [Releases](https://github.com/SalikovAlex/streamdeck-claude-sessions/releases) and double-click it to install.
2. When prompted, install the bundled **Claude Sessions** profile to your Stream Deck +.
3. Grant Automation permission on first use: *System Settings → Privacy & Security → Automation → Elgato Stream Deck → enable iTerm*, then restart the Stream Deck app.

See [PUBLISHING.md](PUBLISHING.md) for release / Marketplace details.

- The bundled 2×4 layout has one Summary control and seven session slots.
- Each key shows the session's **project** (the cwd basename, e.g. `product`, `marketplace`) plus a label (the `--resume` name, or the iTerm2 tab name).
- **Status** (top color bar + dot + label), inferred from the glyph Claude Code puts in the iTerm2 tab title:
  - 🟡 **working** (amber) — a braille spinner is showing / the session is producing output: Claude is thinking or running a tool.
  - 🟢 **your turn** (green) — the `✳` glyph: Claude finished its turn and wants you (next prompt, a question, or a permission confirm).
  - ⚪ **idle** (grey) — no recognisable Claude state.
  - Note: a permission/question prompt and "finished, ready" both surface as `✳` from outside the process, so both read as **your turn** — they can't be told apart without cooperation from Claude Code itself.
- Empty slots show a dim `empty` placeholder.
- **Two ways to use it (keys self-assign roles by relative position — works in any profile/device):**
  - **The deck** (the bundled *Claude Sessions* profile, or any profile with ≥2 of the keys): shows **up to seven sessions** in the bundled profile; the first key is a **`‹ Summary`** control that returns to the previous profile (badged with how many sessions need you). Tap a session to jump to its iTerm2 tab.
  - **A lone key** (drop a single Claude Session action into any other profile, e.g. *Wave Link SD+*): a compact **summary card** — `N Claude` with per-status counts and a `▸ show all` hint. Tap it to open the full deck; tap `‹ Summary` there to come back.
- The keys refresh every 2s while visible; the plugin goes idle otherwise.
- Press a session key → the matching iTerm2 window/tab is brought to the front.
- **Property Inspector** (when you select a key in the Stream Deck app) shows an *Info* panel with the plugin version and a live status line (✅ tracking N sessions / ⚠️ Automation needed).

## How it works

`src/actions/session.ts`:

1. `ps -axo pid=,ppid=,tty=,args=` — enumerate processes; a session is any process whose argv0 basename is `claude`.
2. `lsof -d cwd` — resolve each session's working directory → project name.
3. iTerm2 (via `osascript`) gives the tty → tab-name map.
4. **tty resolution.** An iTerm2 session is `login → zsh (qterm) → zsh → claude`, and the qterm wrapper allocates a *fresh* pty — so the claude process's own tty is not the one iTerm2 reports. We walk the process ancestry of each claude until we hit an ancestor whose tty iTerm2 owns; that's the tab to focus.
5. Keys are painted as SVG (passed to `setImage` as a base64 data URI). Keys are ordered by relative position on each device (row, then column), so they work wherever the action is placed.

## Requirements / gotchas

- **macOS Automation permission.** The Stream Deck app must be allowed to control iTerm2: *System Settings → Privacy & Security → Automation → Elgato Stream Deck → iTerm*. Without it, the iTerm2 tab names and focus-on-press won't work (you'll still see project names). TCC changes require a plugin restart.
- Absolute tool paths are used (`/usr/sbin/lsof` etc.) because the plugin runs with a minimal PATH.
- iTerm2-specific (uses iTerm2's AppleScript dictionary). Other terminals aren't supported.
- Only processes whose executable name is `claude` are detected; sessions launched as `node` are not detected.
- The bundled profile displays the first seven sessions, sorted by project name and then process ID. The summary counts all detected sessions.

## Build & install

Requires Node.js 20+, npm, macOS 12+, iTerm2, and Stream Deck app 6.9+. The app supplies its own Node.js runtime when running the plugin.

```sh
npm ci
npm run build                       # bundles src → com.salikov.claude-sessions.sdPlugin/bin/plugin.js
node scripts/build-profile.mjs      # regenerates "Claude Sessions.streamDeckProfile" (the importable page)
npx @elgato/cli dev
npx @elgato/cli link com.salikov.claude-sessions.sdPlugin
npx @elgato/cli restart com.salikov.claude-sessions
```

`npm run watch` rebuilds and restarts on change. Logs: `com.salikov.claude-sessions.sdPlugin/logs/`.

### Package for distribution

```sh
npm run build
node scripts/build-profile.mjs
npx @elgato/cli validate com.salikov.claude-sessions.sdPlugin
npx @elgato/cli pack com.salikov.claude-sessions.sdPlugin --force   # -> com.salikov.claude-sessions.streamDeckPlugin
```

Double-click the resulting `.streamDeckPlugin` to install it as a normal (non-dev) plugin on any Mac. Note: it shares the UUID `com.salikov.claude-sessions`, so unlink the dev version first (`npx @elgato/cli unlink com.salikov.claude-sessions`) if installing the package on this same machine.

The 8-key page ships as `Claude Sessions.streamDeckProfile` (referenced from the manifest's `Profiles`). Stream Deck prompts to install it on first plugin install; you can also re-import by opening the file.

## Privacy and support

The plugin reads local process arguments, working directories, and iTerm2 tab titles to identify sessions. It communicates with Stream Deck over a local WebSocket and has no telemetry or external service calls.

Local diagnostic logs in `com.salikov.claude-sessions.sdPlugin/logs/` contain project names, session labels, tab titles, and status changes. Logs are excluded from Git. Review and redact logs and screenshots before sharing them in an issue.

For bugs, open a [GitHub issue](https://github.com/SalikovAlex/streamdeck-claude-sessions/issues) with the plugin, macOS, Stream Deck, and iTerm2 versions, reproduction steps, and redacted diagnostics. Contributions are welcome; see [AGENTS.md](AGENTS.md) for implementation guidance and verification steps.

## License

[MIT](LICENSE) © Alexander Salikov
