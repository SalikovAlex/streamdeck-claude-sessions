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
- [x] **Icons are original art** (no Elgato template images): plugin `Icon` 256/512, `CategoryIcon` 28/56, action `Icon` 20/40 — regenerate via `scripts/build-icons.sh`
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
- **Tagline:** See and switch between your running Claude Code sessions from the Stream Deck +.
- **Long description:**
  > A page of keys, one per running Claude Code (CLI) session, each showing its project and a
  > live status — **working** (thinking / running a tool), **your turn** (finished or awaiting a
  > prompt/confirmation), or **idle**. Press a key to jump straight to that session's iTerm2 tab.
  > A summary card aggregates how many sessions need you. **macOS + iTerm2 only.**

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
3. Submit for review; address any feedback; publish.
