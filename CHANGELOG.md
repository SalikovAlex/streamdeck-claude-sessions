# Changelog

## 0.2.1 — 2026-09-06

- Updated the bundled `ws` runtime dependency to address the memory-exhaustion denial-of-service advisory reported by GitHub.
- Includes all Claude and Codex support from 0.2.0.

## 0.2.0 — 2026-09-06

- Added support for Codex CLI and loaded local Codex desktop tasks alongside Claude Code.
- Added Claude, Codex CLI, and Codex app labels to session keys, plus per-agent counts in the Property Inspector.
- Desktop session keys open the matching Codex task. CLI session keys continue to focus iTerm2.
- Read Codex task metadata and turn status locally, with read-only SQLite access and a bounded rollout fallback.
- Excluded Codex service processes, duplicate npm launchers, archived tasks, and subagents.
- Preserved existing plugin/action IDs and the bundled Claude Sessions profile.
- Kept key presses attached to the displayed session when sessions reorder or exit.
- Added regression coverage for detection, status, local data formats, and key navigation.

Codex desktop support covers loaded local tasks. Approval/question prompts may remain marked working until the turn ends. Remote/cloud tasks and VS Code app-server sessions are not included.
