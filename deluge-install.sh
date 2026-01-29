#!/usr/bin/env bash
set -euo pipefail

DELUGE_HOST=${DELUGE_HOST:-"localhost"}
DELUGE_PORT=${DELUGE_PORT:-"58846"}
DELUGE_USER=${DELUGE_USER:-"localclient"}
DELUGE_PASS=${DELUGE_PASS:-""}
DELUGE_LABEL=${DELUGE_LABEL:-""}

if [[ -z "${DELUGE_PASS}" ]]; then
  echo "DELUGE_PASS is required to connect to the Deluge daemon." >&2
  exit 1
fi

deluge-console "connect ${DELUGE_HOST}:${DELUGE_PORT} ${DELUGE_USER} ${DELUGE_PASS}"

# Enable the label plugin before attempting label configuration.
deluge-console "plugin enable Label"

if [[ -n "${DELUGE_LABEL}" ]]; then
  deluge-console "label add ${DELUGE_LABEL}"
fi
