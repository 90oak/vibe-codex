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
  local auth_header=()
  if [[ -n "${GITHUB_TOKEN:-}" ]]; then
    auth_header=(-H "Authorization: Bearer ${GITHUB_TOKEN}")
  fi
  if ! curl -fsSL "${auth_header[@]}" "${api_url}" | python3 - "$file_path" <<'PY'
import json
import sys
from datetime import datetime

path = sys.argv[1]
try:
    data = json.load(sys.stdin)
except json.JSONDecodeError:
    raise SystemExit("INVALID_JSON")
if not data or isinstance(data, dict) and data.get("message"):
    raise SystemExit("NO_COMMIT_DATA")

commit_date = data[0]["commit"]["committer"]["date"]
epoch = int(datetime.fromisoformat(commit_date.replace("Z", "+00:00")).timestamp())
print(epoch)
PY
  then
    return 1
  fi
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
  if ! remote_epoch=$(get_remote_epoch "${file}"); then
    echo "WARN: GitHub commit lookup failed for ${file}; downloading latest copy."
    curl -fsSL "${url}" -o "${file}"
    downloaded=true
  fi
  if [[ -f "${file}" ]]; then
    local_epoch=$(get_local_epoch "${file}")
    if [[ -n "${remote_epoch:-}" && "${remote_epoch}" -gt "${local_epoch}" ]]; then
      curl -fsSL "${url}" -o "${file}"
      downloaded=true
    fi
  else
    if [[ "${downloaded}" != "true" ]]; then
      curl -fsSL "${url}" -o "${file}"
      downloaded=true
    fi
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
