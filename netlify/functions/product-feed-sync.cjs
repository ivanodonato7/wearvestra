/**
 * product-feed-sync — daily (or manual) Awin Create-a-Feed ingest.
 *
 * Fetches AWIN_FEED_URL, streams/parses CSV without loading ~900MB into memory,
 * keeps a filtered menswear subset, and writes it to Netlify Blobs (or /tmp locally).
 *
 * Env:
 *   AWIN_FEED_URL — full https://productdata.awin.com/datafeed/download/apikey/... URL
 *   AWIN_SYNC_SECRET — optional; if set, POST must send header x-vestra-sync-secret
 *   AWIN_MAX_PRODUCTS — optional total cap (default 4000)
 *
 * Schedule: daily at 07:00 UTC (see netlify.toml). Prefer daily refresh —
 * do NOT run this on every stylist / product-search request.
 */
const {
  streamMenswearFromFeedUrl,
  writeMenswearCache,
  resolveFeedUrl,
  DEFAULT_CAPS,
} = require("./lib/awinMenswearFeed.cjs");

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, x-vestra-sync-secret",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Content-Type": "application/json",
  };
}

function authorized(event) {
  const secret = process.env.AWIN_SYNC_SECRET || "";
  if (!secret) return true; // open trigger until you set a secret
  const hdr = event.headers?.["x-vestra-sync-secret"] || event.headers?.["X-Vestra-Sync-Secret"] || "";
  return hdr === secret;
}

async function runSync() {
  const feedUrl = resolveFeedUrl();
  if (!feedUrl) {
    return {
      ok: false,
      reason: "missing_feed_url",
      message: "Set AWIN_FEED_URL in Netlify to your Create-a-Feed download URL.",
    };
  }
  if (!/^https:\/\/productdata\.awin\.com\//i.test(feedUrl)) {
    return {
      ok: false,
      reason: "invalid_feed_url",
      message: "AWIN_FEED_URL must be an https://productdata.awin.com/... URL.",
    };
  }

  const maxTotal = Math.min(Math.max(Number(process.env.AWIN_MAX_PRODUCTS || 4000), 100), 8000);
  const { items, meta } = await streamMenswearFromFeedUrl(feedUrl, {
    caps: DEFAULT_CAPS,
    maxTotal,
  });

  if (!items.length) {
    return {
      ok: false,
      reason: "empty_after_filter",
      meta,
      message: "Feed downloaded but no menswear rows matched filters.",
    };
  }

  const stored = await writeMenswearCache({ items, meta });
  return {
    ok: true,
    source: "awin",
    count: items.length,
    meta,
    stored,
  };
}

exports.handler = async (event) => {
  const headers = corsHeaders();
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  // Scheduled invocations may arrive without httpMethod; treat as sync
  const isSchedule = !event.httpMethod || event.httpMethod === "GET" || event.httpMethod === "POST";
  if (!isSchedule) {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  if (event.httpMethod && !authorized(event)) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: "Unauthorized" }) };
  }

  try {
    const result = await runSync();
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(result),
    };
  } catch (err) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: false,
        reason: "sync_error",
        message: err?.message || "Awin sync failed",
      }),
    };
  }
};
