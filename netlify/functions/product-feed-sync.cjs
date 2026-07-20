/**
 * product-feed-sync — status + kick helper.
 *
 * The heavy work runs in product-feed-sync-background (Netlify Background Fn).
 * This endpoint:
 *   GET  → latest sync status / cache counts (fast)
 *   POST → reminds client to hit the background URL (or we proxy-invoke it)
 *
 * Prefer: POST /.netlify/functions/product-feed-sync-background
 * Alias:  POST /api/product-feed-sync  → redirects to background in netlify.toml
 */
const { readMenswearCache, readSyncStatus, resolveFeedUrl } = require("./lib/awinMenswearFeed.cjs");

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, x-vestra-sync-secret",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Content-Type": "application/json",
  };
}

exports.handler = async (event) => {
  const headers = corsHeaders();
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  const [status, cache] = await Promise.all([readSyncStatus(), readMenswearCache()]);
  const body = {
    feedConfigured: Boolean(resolveFeedUrl()),
    sync: status || null,
    cache: cache
      ? {
          count: cache.items?.length || 0,
          fetchedAt: cache.meta?.fetchedAt || cache.fetchedAt || null,
          byFamily: cache.meta?.byFamily || null,
        }
      : null,
    trigger: "POST /api/product-feed-sync (background) — returns 202, then poll this GET or /api/product-search",
  };

  // POST on the non-background name: tell client to use background endpoint.
  // (netlify.toml redirects /api/product-feed-sync → background, so this rarely runs in prod.)
  if (event.httpMethod === "POST") {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ...body,
        ok: false,
        reason: "use_background",
        message: "Use POST /api/product-feed-sync (mapped to product-feed-sync-background) for the long sync.",
      }),
    };
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify(body),
  };
};
