#!/bin/bash
# Build the game and force-push dist/ to the gh-pages branch (GitHub Pages).
set -euo pipefail
cd "$(dirname "$0")/.."
npm run build
cd dist
touch .nojekyll
rm -rf .git
git init -q -b gh-pages
git config user.email "$(git -C .. config user.email)"
git config user.name "$(git -C .. config user.name)"
git add -A
git commit -qm "Deploy $(git -C .. rev-parse --short HEAD)"
git push -q -f "$(git -C .. remote get-url origin)" gh-pages
rm -rf .git
echo "Deployed. Live in ~1 minute at https://wellsdouraghy.github.io/hinsdale-central-ffa/"
