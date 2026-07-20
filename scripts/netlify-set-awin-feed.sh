#!/usr/bin/env bash
# Set AWIN_FEED_URL on the linked Netlify site (never commit the URL/key).
# Usage:
#   export AWIN_FEED_URL='https://productdata.awin.com/datafeed/download/apikey/…'
#   bash scripts/netlify-set-awin-feed.sh
set -euo pipefail
if [[ -z "${AWIN_FEED_URL:-}" ]]; then
  echo "Export AWIN_FEED_URL first (your Create-a-Feed download URL), then re-run."
  exit 1
fi
if [[ ! "$AWIN_FEED_URL" =~ ^https://productdata\.awin\.com/ ]]; then
  echo "AWIN_FEED_URL must start with https://productdata.awin.com/"
  exit 1
fi
npx netlify-cli env:set AWIN_FEED_URL "$AWIN_FEED_URL"
npx netlify-cli env:list
echo "Done. Redeploy, then POST /api/product-feed-sync once to fill the Blobs cache."
