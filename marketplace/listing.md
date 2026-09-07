# Claude & Codex Sessions

Marketplace product name: **Claude Sessions** (locked). The manifest must use this exact name for uploads.

## Short description

See Claude Code and Codex sessions on your Stream Deck +. Press a key to open the matching terminal tab or desktop task.

## Description

Keep your coding sessions within reach. Claude & Codex Sessions shows Claude Code CLI, Codex CLI, and loaded local Codex desktop tasks together on your Stream Deck +.

Each key shows the agent, project, session label, and status. Press a CLI key to focus its iTerm2 tab, or a Codex app key to open that task in the desktop app. A single key on another profile becomes a summary with counts for working, your turn, and idle sessions. Tap it to open the bundled deck, which has a Summary control and seven session slots.

Sessions are detected automatically. No API keys, hooks, or Codex configuration changes are required. The plugin reads process information, iTerm2 titles, and local Codex session metadata. It sends no conversation data over the network.

Requires macOS 12+, Stream Deck 6.9+, and Stream Deck +. CLI navigation requires iTerm2 and Automation permission for Stream Deck to control iTerm2. Codex desktop support covers loaded local tasks; remote/cloud tasks and VS Code sessions are excluded. Codex approval/question prompts may continue to show working until the turn ends.

Unofficial community plugin. Not affiliated with or endorsed by Anthropic or OpenAI. Claude and Claude Code are trademarks of Anthropic; Codex is an OpenAI product.

## Version 0.2.2 release notes

- Retained the existing Marketplace product name for update compatibility.
- Updated the bundled WebSocket dependency to address a denial-of-service vulnerability.
- Added Codex CLI sessions and loaded local Codex desktop tasks alongside Claude Code.
- Added agent labels, desktop task navigation, and per-agent counts in the Info panel.
- Preserved existing keys and the bundled Claude Sessions profile.
- Fixed key presses opening a different session when the session list changes.
- Improved session detection, local status handling, and scan coordination.

## Upload files

- Plugin: `com.salikov.claude-sessions.streamDeckPlugin` (version 0.2.2.0).
- Icon: `marketplace/icon.png` (288 × 288).
- Thumbnail: `marketplace/thumbnail.png` (1920 × 960).
- Gallery: `marketplace/gallery-1-detail.png`, `marketplace/gallery-2-summary.png`, `marketplace/gallery-3-status.png` (1920 × 960 each).
