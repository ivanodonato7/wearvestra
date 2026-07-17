#!/usr/bin/env bash
# Set ANTHROPIC_API_KEY on the linked Netlify site (run after `npx netlify login` + `npx netlify link`).
set -euo pipefail
if [[ -z "${ANTHROPIC_API_KEY:-}" ]]; then
  echo "Export ANTHROPIC_API_KEY first, then re-run."
  exit 1
fi
npx netlify-cli env:set ANTHROPIC_API_KEY "$ANTHROPIC_API_KEY"
npx netlify-cli env:list
echo "Done. Redeploy with: npm run deploy:netlify"
