#!/usr/bin/env bash
# Live check of records-app against the PRODUCTION test vault. Kai signs in himself; this script only serves the app.
# - Origin http://localhost:5251: one of the two localhost entries of production FIRST_PARTY_ORIGINS
#   (RuleRigdevProdFirstPartyOrigin); strictPort so a busy port fails loudly (RuleRigdevNoInventPort).
# - VITE_PLATFORM_ORIGIN is the value GilbApp production builds use: VITE_BASE_ORIGIN=https://gilb.com
#   (GilbApp 9a602ea7 src/lib/base/config.ts:12).
# - The log goes outside every worktree (RuleRigdevLogOutsideWorktree).
# - A reload ends the session: the local path is cookieless by design (RuleRigdevCookielessMintForLocal).
# - The one-time code: ask for it at https://gilb.com/onboard/start (RuleRigdevOtcFromMailboxNotLog).
set -euo pipefail

export VITE_VAULT_URL="https://testappvaultaccess.gilb.com/vault"
export VITE_SUPERSEDE_ONLY=1
export VITE_ID_ORIGIN="https://id.gilb.com"
export VITE_PLATFORM_ORIGIN="https://gilb.com"

PORT=5251
LOG="$HOME/Library/Logs/records-app-live.log"

if lsof -nP -iTCP:${PORT} -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Port ${PORT} is already listening; refusing to start. Stop that server first." >&2
  exit 1
fi

mkdir -p "$(dirname "$LOG")"
cd "$(dirname "${BASH_SOURCE[0]}")/.."
npx vite --port "${PORT}" --strictPort 2>&1 | tee -a "$LOG"
