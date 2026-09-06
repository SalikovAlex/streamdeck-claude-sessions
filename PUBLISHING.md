# Publishing

Two channels: **GitHub** (source + releases) and the **Elgato Marketplace** (one-click install for users).

---

## 1. GitHub releases

The repo is MIT-licensed and self-contained.

**Release flow:**
```sh
npm ci
npm test
npm run typecheck
npm run build
node scripts/build-profile.mjs
bash scripts/build-icons.sh            # regenerate icons (optional; committed already)
streamdeck pack com.salikov.claude-sessions.sdPlugin --force
```
Attach the resulting `com.salikov.claude-sessions.streamDeckPlugin` to a GitHub Release so users can download + double-click to install.

Tag releases to match the manifest `Version` (e.g. `v0.1.0`).

---

## 2. Elgato Marketplace

Portal: <https://maker.elgato.com/> (sign in with an Elgato/Maker account).

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

### Listing copy and disclosures

Use [marketplace/listing.md](marketplace/listing.md) for the current name, descriptions, version notes, and asset paths. Regenerate screenshots with `node scripts/build-marketplace-assets.mjs` when the key layout or provider labels change, and visually inspect every generated image.

The listing must describe macOS and Stream Deck + requirements, iTerm2/Automation requirements for CLI navigation, local-only Codex desktop coverage, approximate Codex approval status, and the unofficial status of the plugin. Keep the generic terminal icon; do not imply endorsement by Anthropic or OpenAI.

The source repository is currently private. Its URL returns 404 to unauthenticated users, so `streamdeck validate` reports a URL warning. Do not change repository visibility as part of a release without explicit authorization. Preserve the existing Marketplace support destination unless the owner provides a replacement.

### Submit
1. `streamdeck pack com.salikov.claude-sessions.sdPlugin --force`
2. Sign in to the [Maker Console](https://maker.elgato.com/) and open the existing product; create a version update instead of a duplicate listing.
3. Upload the `.streamDeckPlugin`, add the version notes, and update listing copy/assets as needed.
4. Submit for review and verify the resulting status. Upload, review submission, and Marketplace publication are distinct states; report the state the portal actually confirms.

Current official workflow: [Managing Products](https://docs.elgato.com/maker-console/managing-products).
