#!/usr/bin/env bash
set -euo pipefail

REPO="90oak/vibe-codex"
BRANCH="main"

BASE_URL="https://raw.githubusercontent.com/${REPO}/${BRANCH}"
COMMITS_URL="https://api.github.com/repos/${REPO}/commits"
FILES=(
  "burst_provision_local.sh"
  "burst_teardown_local.sh"
  "remove_oversized_torrents.py"
)

downloaded_count=0
updated_remove_oversized=false

get_remote_epoch() {
  local file_path="$1"
  local api_url="${COMMITS_URL}?path=${file_path}&sha=${BRANCH}&per_page=1"
  curl -fsSL "${api_url}" | python3 - "$file_path" <<'PY'
import json
import sys
from datetime import datetime

path = sys.argv[1]
data = json.load(sys.stdin)
if not data:
    raise SystemExit(f"No commit data for {path}")

commit_date = data[0]["commit"]["committer"]["date"]
epoch = int(datetime.fromisoformat(commit_date.replace("Z", "+00:00")).timestamp())
print(epoch)
PY
}

get_local_epoch() {
  local file_path="$1"
  if stat -c %Y "${file_path}" >/dev/null 2>&1; then
    stat -c %Y "${file_path}"
  else
    stat -f %m "${file_path}"
  fi
}

for file in "${FILES[@]}"; do
  url="${BASE_URL}/${file}"
  echo "Checking ${url}"
  downloaded=false
  remote_epoch=$(get_remote_epoch "${file}")
  if [[ -f "${file}" ]]; then
    local_epoch=$(get_local_epoch "${file}")
    if [[ "${remote_epoch}" -gt "${local_epoch}" ]]; then
      curl -fsSL "${url}" -o "${file}"
      downloaded=true
    fi
  else
    curl -fsSL "${url}" -o "${file}"
    downloaded=true
  fi

  if [[ "${downloaded}" == "true" ]]; then
    chmod 755 "${file}"
    downloaded_count=$((downloaded_count + 1))
    if [[ "${file}" == "remove_oversized_torrents.py" ]]; then
      updated_remove_oversized=true
    fi
  fi
done

echo "Done. Downloaded ${downloaded_count} files and set permissions to 755."
if [[ "${updated_remove_oversized}" == "true" ]]; then
  echo "Reminder: update remove_oversized_torrents.py with the correct Deluge username and password."
fi
