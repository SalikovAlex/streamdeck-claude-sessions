# Contributing

Bug reports and pull requests are welcome. For bugs, include macOS, Stream Deck, iTerm2, and plugin versions, the steps to reproduce, and what you expected to happen. For Codex issues, include whether the session is CLI or desktop.

Review logs and screenshots before sharing: project names, terminal titles, and task labels can contain private information. Never attach credentials, conversation files, or an entire Codex data directory.

## Development

Use Node.js 20+ on macOS. Start with `npm ci`, then run:

```sh
npm test
npm run typecheck
npm run build
node scripts/build-profile.mjs
```

Follow [AGENTS.md](AGENTS.md) for architecture, formatting, and platform details. Keep changes focused and add regression coverage for changed behavior. Generated plugin binaries, logs, profiles, and packaged releases are ignored; commit source files and intentional listing/icon assets.

For hardware verification, link and restart the plugin as described in [README.md](README.md), check the runtime logs, and verify the keys and Property Inspector in Stream Deck. Automated checks cannot confirm physical key appearance or macOS Automation permissions.

Describe the problem, resulting behavior, and verification in your pull request. Contributions are licensed under the repository's [MIT license](LICENSE).
