# Claude Sessions — Stream Deck + plugin

Shows your running **Claude Code** sessions on the Stream Deck + keys, and **jumps to the matching iTerm2 tab** when you press a key.

> **Unofficial / community project.** Not affiliated with, sponsored, or endorsed by Anthropic.
> "Claude" and "Claude Code" are trademarks of Anthropic. **Requires macOS + iTerm2 + a Stream Deck +.**

## Install (users)

1. Download the latest `com.salikov.claude-sessions.streamDeckPlugin` from [Releases](https://github.com/SalikovAlex/streamdeck-claude-sessions/releases) and double-click it to install.
2. When prompted, install the bundled **Claude Sessions** profile to your Stream Deck +.
3. Grant Automation permission on first use: *System Settings → Privacy & Security → Automation → Elgato Stream Deck → enable iTerm*, then restart the Stream Deck app.

See [PUBLISHING.md](PUBLISHING.md) for release / Marketplace details.

- One key per session, laid out 2×4 on the Stream Deck +.
- Each key shows the session's **project** (the cwd basename, e.g. `product`, `marketplace`) plus a label (the `--resume` name, or the iTerm2 tab name).
- **Status** (top color bar + dot + label), inferred from the glyph Claude Code puts in the iTerm2 tab title:
  - 🟡 **working** (amber) — a braille spinner is showing / the session is producing output: Claude is thinking or running a tool.
  - 🟢 **your turn** (green) — the `✳` glyph: Claude finished its turn and wants you (next prompt, a question, or a permission confirm).
  - ⚪ **idle** (grey) — no recognisable Claude state.
  - Note: a permission/question prompt and "finished, ready" both surface as `✳` from outside the process, so both read as **your turn** — they can't be told apart without cooperation from Claude Code itself.
- Empty slots show a dim `empty` placeholder.
- **Summary / detail toggle — one key (top-left, slot 0).**
  - *Summary* (default): the top-left key is an aggregate card — `N Claude` with per-status counts (working / your turn / idle) and a `▸ show all` hint; the other keys are dim. Tap anything to expand.
  - *Detail*: the top-left key becomes the **≡ Summarise** button (with a green badge of how many sessions need you), and the 7 sessions fill slots 1–7. Tap a session to jump to its iTerm2 tab; tap **Summarise** to collapse.
  - One physical key does both jobs — summary card ⇄ Summarise button. (Detail caps at 7 sessions, since slot 0 is the toggle.)
- The keys refresh every 2s while the **Claude Sessions** profile is showing; the plugin goes idle otherwise.
- Press a session key → the matching iTerm2 window/tab is brought to the front.

## How it works

`src/actions/session.ts`:

1. `ps -axo pid=,ppid=,tty=,args=` — enumerate processes; a session is any process whose argv0 basename is `claude`.
2. `lsof -d cwd` — resolve each session's working directory → project name.
3. iTerm2 (via `osascript`) gives the tty → tab-name map.
4. **tty resolution.** An iTerm2 session is `login → zsh (qterm) → zsh → claude`, and the qterm wrapper allocates a *fresh* pty — so the claude process's own tty is not the one iTerm2 reports. We walk the process ancestry of each claude until we hit an ancestor whose tty iTerm2 owns; that's the tab to focus.
5. Keys are painted as SVG (passed to `setImage` as a base64 data URI). The slot index is derived from each key's coordinates (`row*4 + column`), so it works wherever the action is placed.

## Requirements / gotchas

- **macOS Automation permission.** The Stream Deck app must be allowed to control iTerm2: *System Settings → Privacy & Security → Automation → Elgato Stream Deck → iTerm*. Without it, the iTerm2 tab names and focus-on-press won't work (you'll still see project names). TCC changes require a plugin restart.
- Absolute tool paths are used (`/usr/sbin/lsof` etc.) because the plugin runs with a minimal PATH.
- iTerm2-specific (uses iTerm2's AppleScript dictionary). Other terminals aren't supported.
- This Claude Code session was launched as `node`, not `claude`, so it may not always appear in the list.

## Build & install

```sh
npm install
npm run build                       # bundles src → com.salikov.claude-sessions.sdPlugin/bin/plugin.js
node scripts/build-profile.mjs      # regenerates "Claude Sessions.streamDeckProfile" (the importable page)
streamdeck link com.salikov.claude-sessions.sdPlugin
streamdeck restart com.salikov.claude-sessions
```

`npm run watch` rebuilds and restarts on change. Logs: `com.salikov.claude-sessions.sdPlugin/logs/`.

### Package for distribution

```sh
npm run build
streamdeck pack com.salikov.claude-sessions.sdPlugin --force   # -> com.salikov.claude-sessions.streamDeckPlugin
```

Double-click the resulting `.streamDeckPlugin` to install it as a normal (non-dev) plugin on any Mac. Note: it shares the UUID `com.salikov.claude-sessions`, so unlink the dev version first (`streamdeck unlink com.salikov.claude-sessions`) if installing the package on this same machine.

The 8-key page ships as `Claude Sessions.streamDeckProfile` (referenced from the manifest's `Profiles`). Stream Deck prompts to install it on first plugin install; you can also re-import by opening the file.

## License

[MIT](LICENSE) © Alexander Salikov
