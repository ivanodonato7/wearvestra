#!/usr/bin/env bash
# Set SERPER_API_KEY (and optional SKIMLINKS_SITE_ID) on the linked Netlify site.
# Usage:
#   SERPER_API_KEY=... ./scripts/netlify-set-serper.sh
#   SERPER_API_KEY=... SKIMLINKS_SITE_ID=... ./scripts/netlify-set-serper.sh
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ -z "${SERPER_API_KEY:-}" ]]; then
  echo "SERPER_API_KEY is required" >&2
  exit 1
fi

npx netlify-cli env:set SERPER_API_KEY "$SERPER_API_KEY" --context production
npx netlify-cli env:set SERPER_API_KEY "$SERPER_API_KEY" --context deploy-preview
npx netlify-cli env:set SERPER_API_KEY "$SERPER_API_KEY" --context branch-deploy

if [[ -n "${SKIMLINKS_SITE_ID:-}" ]]; then
  npx netlify-cli env:set SKIMLINKS_SITE_ID "$SKIMLINKS_SITE_ID" --context production
  npx netlify-cli env:set SKIMLINKS_SITE_ID "$SKIMLINKS_SITE_ID" --context deploy-preview
  echo "SKIMLINKS_SITE_ID set"
fi

echo "Serper env set. Redeploy so stylist functions pick it up."
