# Publishing

Two channels: **GitHub** (source + releases) and the **Elgato Marketplace** (one-click install for users).

---

## 1. GitHub (open source)

The repo is MIT-licensed and self-contained.

**Release flow:**
```sh
npm ci
npm run build
node scripts/build-profile.mjs
bash scripts/build-icons.sh            # regenerate icons (optional; committed already)
streamdeck pack com.salikov.claude-sessions.sdPlugin --force
```
Attach the resulting `com.salikov.claude-sessions.streamDeckPlugin` to a GitHub Release so users can download + double-click to install.

Tag releases to match the manifest `Version` (e.g. `v0.1.0`).

---

## 2. Elgato Marketplace

Portal: <https://marketplace.elgato.com/maker> (sign in with an Elgato/Maker account).

### Manifest readiness (done in this repo)
- [x] `Name`, `Author`, `Version` (`{major}.{minor}.{patch}.{build}`), `UUID` (reverse-DNS)
- [x] `Description`, `URL`, `Category`, `CodePath`, `SDKVersion`, `Software.MinimumVersion`, `OS`
- [x] **Icons are original art** (no Elgato template images): plugin `Icon` 256/512 PNG, `CategoryIcon` + action `Icon` as SVG — regenerate via `scripts/build-icons.sh`
- [x] **In-app icons are white on transparent** (`CategoryIcon`, action `Icon`) — Elgato review rejects colour or
      solid-background icons ([guidelines](https://docs.elgato.com/guidelines/stream-deck/plugins#icons)).
      They are shipped as SVG (Elgato's preferred format). Do not rasterise them with `qlmanage`: it fills the
      alpha channel with white and you get a blank white square (this is what v0.1.2 shipped).
- [x] Node `Debug` disabled for release
- [x] `streamdeck validate` passes
- [x] `.streamDeckPlugin` builds via `streamdeck pack`

### Listing assets (uploaded in the Maker portal — NOT in the manifest)
Follow the exact dimensions the portal shows at upload time. Typically you provide:
- [ ] Marketplace **icon** (high-res, square)
- [ ] One or more **screenshots / hero images** of the plugin in use (photograph the Stream Deck + showing the keys; a mock is fine)
- [ ] **Short description** (one line) and **long description** (Markdown)
- [ ] **Category** + tags
- [ ] Support / homepage URL (the GitHub repo)

### Draft listing copy
- **Name:** Claude Sessions *(see trademark note — consider "Claude Code Session Switcher (unofficial)")*
- **Tagline:** See and switch between your running Claude Code sessions from the Stream Deck.

- **Long description (Markdown):**

  > **Claude Sessions** turns your Stream Deck into a live dashboard for your running Claude Code
  > (CLI) sessions on macOS. Each key represents one session and updates every ~2 seconds.
  >
  > **What you see on a key**
  > - **Project name** — derived from the session's working directory.
  > - **Live status bar** — colour-coded:
  >   - 🟠 **Working** — Claude is thinking or running a tool.
  >   - 🟢 **Your turn** — Claude finished or is asking you to confirm something.
  >   - ⚫ **Idle** — session is open but quiet.
  > - **Status dot + label** — same signal, larger, so it's readable at a glance.
  >
  > **What pressing a key does**
  > - **A session key** — focuses the matching iTerm2 window/tab so you can keep typing
  >   without alt-tabbing.
  > - **The first key on the deck (summary card)** — returns to your previous Stream Deck
  >   profile when you're done.
  > - **A lone Claude Sessions key on any profile** — shows an aggregated summary
  >   ("3 sessions, 1 needs you") and, when tapped, opens the dedicated 8-key Claude Sessions
  >   profile.
  >
  > **What's included**
  > - The plugin itself (Node.js 20, Stream Deck SDK 3, MIT-licensed).
  > - A bundled **Claude Sessions** profile for Stream Deck + (4×2 keys, one summary key
  >   + seven session slots) that auto-installs on first run.
  > - A Property Inspector showing the plugin version, live connection status, and a hint
  >   about the required Automation permission.
  >
  > **How it works (locally, no network)**
  > - Scans your running processes for `claude` (the Claude Code CLI).
  > - Walks each process's parent chain to find the owning iTerm2 tab.
  > - Reads each tab's title to detect status (Braille spinner = working, ✳ = waiting).
  > - All of this happens on your Mac — nothing is sent off-machine.
  >
  > **Requirements**
  > - **macOS** (Apple Silicon or Intel) — Linux/Windows not supported.
  > - **iTerm2** — the terminal-focusing logic uses iTerm2's AppleScript API.
  > - **Stream Deck 6.9+** with the Claude Code CLI installed and running in iTerm2.
  > - On first launch macOS will ask permission for Stream Deck to control iTerm
  >   (System Settings → Privacy & Security → Automation → Stream Deck → iTerm).
  >   Without this, the plugin shows "Enable Automation" in the Property Inspector and
  >   key presses won't focus tabs.
  >
  > **Limitations**
  > - macOS + iTerm2 only.
  > - Best on Stream Deck + (the bundled profile fits its 4×2 keypad); also works on
  >   other Stream Deck devices as individual keys.
  > - "Status" is inferred from the terminal tab title — if you've heavily customised
  >   the Claude prompt, detection may degrade.
  >
  > **Unofficial.** Not affiliated with, sponsored by, or endorsed by Anthropic.
  > "Claude" and "Claude Code" are trademarks of Anthropic. Source + issues:
  > <https://github.com/SalikovAlex/streamdeck-claude-sessions>.

### Must disclose in the listing (and gate review)
- [ ] **macOS only**, **iTerm2 only**, designed for **Stream Deck +** (2×4 keys).
- [ ] Requires granting **Automation** permission (Stream Deck → iTerm) on first use.
- [ ] Reads the running `claude` processes + iTerm2 tab titles locally; sends nothing off-machine.

### ⚠️ Trademark — read before submitting
"Claude" and "Claude Code" are trademarks of **Anthropic**. This is an **unofficial, community** plugin
with no affiliation or endorsement. Before a public listing:
- Consider a descriptive, clearly-unofficial name (e.g. *"Session Switcher for Claude Code (unofficial)"*).
- Add an "unofficial / not affiliated with Anthropic" disclaimer to the listing and README.
- The icon uses generic terminal artwork (no Anthropic logo) — keep it that way.
- Elgato review may ask for permission/justification to use a third-party brand name. Be ready to rename.

### Submit
1. `streamdeck pack com.salikov.claude-sessions.sdPlugin --force`
2. Upload the `.streamDeckPlugin` in the Maker portal, fill the listing, attach assets.
3. **Demo video (required by Elgato review).** Plugins that need hardware must ship a short video proving
   functionality, emailed to <maker@elgato.com> (reply to the review thread). Suggested 60–90 s screen recording
   (QuickTime → New Screen Recording, plus a phone shot of the physical Stream Deck if possible):
   1. Stream Deck app: the **Claude Sessions** category and action in the action list (white icons visible).
   2. Two or three `claude` sessions running in iTerm2 tabs; the keys show project names + status bars.
   3. Send a prompt in one tab → its key turns **working** (amber); when it finishes → **your turn** (green).
   4. Press a session key → iTerm2 focuses that tab. Press the summary key → returns to the previous profile.
   5. Property Inspector showing plugin version + connection status.
4. Submit for review; address any feedback; publish.

### Review history
- **v0.1.1 / v0.1.2 — rejected:** category + action icons must be white (they were colour in 0.1.1 and a solid
  white square in 0.1.2 due to the qlmanage alpha bug); demo video requested. Fixed in **v0.1.3** (SVG icons).
