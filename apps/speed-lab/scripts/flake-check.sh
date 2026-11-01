#!/usr/bin/env bash
# N cold rounds of: rm -rf node_modules dist && npm ci --silent && npx vitest run. Usage: scripts/flake-check.sh N
set -u
N="${1:-5}"
cd "$(dirname "$0")/.."
ok=0
for i in $(seq 1 "$N"); do
  rm -rf node_modules dist
  if ! npm ci --silent >/dev/null 2>&1; then echo "round $i: FAIL npm ci"; continue; fi
  out="$(npx vitest run 2>&1 | sed 's/\x1b\[[0-9;]*m//g')"
  if echo "$out" | grep -q "^ *FAIL\| × "; then
    echo "round $i: FAIL $(echo "$out" | grep -m1 -E '^ *FAIL|^ *× ' | sed 's/^ *//')"
  else echo "round $i: pass"; ok=$((ok + 1)); fi
done
echo "$ok/$N passed"
[ "$ok" -eq "$N" ]
