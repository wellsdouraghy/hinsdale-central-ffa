#!/bin/bash
# Build the committed HEAD in a clean temporary checkout (so uncommitted work never ships) and publish dist/
# to the gh-pages branch (GitHub Pages). The deploy commit is created inside this repo, so it uses the repo's
# own git identity; nothing here reads or copies identity settings.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
TMP="$(mktemp -d)"
REL="$TMP/release"
IDX="$TMP/index"
trap 'git -C "$ROOT" worktree remove --force "$REL" >/dev/null 2>&1 || true; rm -rf "$TMP"' EXIT

git worktree add -q --detach "$REL" HEAD
ln -s "$ROOT/node_modules" "$REL/node_modules"
[ -f "$ROOT/.env.local" ] && cp "$ROOT/.env.local" "$REL/.env.local"
(cd "$REL" && npx vite build)
touch "$REL/dist/.nojekyll"

GIT_INDEX_FILE="$IDX" git --work-tree="$REL/dist" add -A
TREE="$(GIT_INDEX_FILE="$IDX" git write-tree)"
COMMIT="$(git commit-tree "$TREE" -m "Deploy $(git rev-parse --short HEAD)")"
git push -q -f origin "$COMMIT:refs/heads/gh-pages"
echo "Deployed $(git rev-parse --short HEAD). Live in ~1 minute at https://wellsdouraghy.github.io/hinsdale-central-ffa/"
