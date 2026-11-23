#!/usr/bin/env bash
# Runs every acceptance/tests/*.sh against the running app at BASE_URL. Fails if any test fails.
set -euo pipefail

: "${BASE_URL:?BASE_URL must point at the running app}"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

failed=0
total=0
for test in "$DIR"/tests/*.sh; do
  total=$((total + 1))
  if BASE_URL="$BASE_URL" bash "$test"; then
    echo "pass: $(basename "$test")"
  else
    echo "FAIL: $(basename "$test")"
    failed=$((failed + 1))
  fi
done
echo "$((total - failed)) of $total acceptance tests passed"
[[ "$failed" -eq 0 ]]
