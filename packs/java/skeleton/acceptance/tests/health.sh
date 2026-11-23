#!/usr/bin/env bash
# GET /health answers 200 with the body {"status":"UP"}.
set -euo pipefail

body_file="$(mktemp)"
trap 'rm -f "$body_file"' EXIT

status=$(curl -s -o "$body_file" -w '%{http_code}' "$BASE_URL/health" || true)
body=$(cat "$body_file")

[[ "$status" == "200" ]] || { echo "GET /health: expected 200, got $status"; exit 1; }
[[ "$body" == '{"status":"UP"}' ]] || { echo "GET /health: expected {\"status\":\"UP\"}, got '$body'"; exit 1; }
