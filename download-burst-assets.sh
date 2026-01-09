#!/usr/bin/env bash
set -euo pipefail

REPO="example/vibe-codex"
BRANCH="main"

BASE_URL="https://raw.githubusercontent.com/${REPO}/${BRANCH}"
FILES=(
  "burst_provision_local.sh"
  "burst_teardown_local.sh"
  "remove_oversized_torrents.py"
)

for file in "${FILES[@]}"; do
  url="${BASE_URL}/${file}"
  echo "Downloading ${url}"
  curl -fsSL "${url}" -o "${file}"
  chmod 755 "${file}"
done

echo "Done. Downloaded ${#FILES[@]} files and set permissions to 755."
