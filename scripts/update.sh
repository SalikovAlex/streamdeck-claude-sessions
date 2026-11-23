#!/usr/bin/env bash
# Update a dev-linked checkout to the latest main, rebuild, and restart the plugin.
#   scripts/update.sh            pull main, npm ci, test, build, restart
#   scripts/update.sh --release  install the latest GitHub release instead (no checkout needed)
set -euo pipefail

UUID="com.salikov.claude-sessions"
REPO="SalikovAlex/streamdeck-claude-sessions"

if [[ "${1:-}" == "--release" ]]; then
	command -v gh >/dev/null || { echo "gh CLI is required for --release" >&2; exit 1; }
	dir="$(mktemp -d)"
	gh release download --repo "$REPO" --pattern '*.streamDeckPlugin' --dir "$dir"
	echo "Opening $(gh release view --repo "$REPO" --json tagName -q .tagName) installer in Stream Deck…"
	/usr/bin/open "$dir"/*.streamDeckPlugin
	exit 0
fi

cd "$(dirname "$0")/.."

# Another agent session may own this checkout: never switch branches or discard work.
branch="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$branch" != "main" ]]; then
	echo "On branch '$branch', not main. Use a separate git worktree, or switch yourself first." >&2
	exit 1
fi
if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
	echo "Working tree has uncommitted changes; commit or stash them first." >&2
	git status --short --untracked-files=no >&2
	exit 1
fi

before="$(git rev-parse HEAD)"
git pull --ff-only
after="$(git rev-parse HEAD)"
if [[ "$before" == "$after" ]]; then echo "Already up to date ($(git describe --tags --always))."
else git --no-pager log --oneline "$before..$after"; fi

# Reinstall dependencies only when they are missing or the lockfile changed.
if [[ ! -d node_modules ]] || ! git diff --quiet "$before" "$after" -- package-lock.json; then npm ci; fi
npm test
npm run build
npx --yes @elgato/cli restart "$UUID"
echo "Updated to $(node -p 'require("./package.json").version') and restarted $UUID."
