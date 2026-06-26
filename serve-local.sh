#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

host="${HOST:-0.0.0.0}"
port="${PORT:-8083}"

echo "Serving UsefulTool at http://${host}:${port}"
python3 -m http.server "$port" --bind "$host"
