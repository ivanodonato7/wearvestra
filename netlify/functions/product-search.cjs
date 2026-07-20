/**
 * product-search — serve cached Awin menswear (fast path).
 *
 * Reads the filtered subset written by product-feed-sync (Netlify Blobs /tmp).
 * Does NOT re-download the ~900MB Create-a-Feed on each request.
 *
 * Returns Vestra-shaped items, or { source: "backup", items: [] } when the
 * cache is empty so the client keeps using BACKUP_CATALOG.
 *
 * Optional: POST { "sync": true } triggers a sync first (slow; for admin use).
 * Prefer the daily scheduled product-feed-sync instead.
 */
const {
  readMenswearCache,
  resolveFeedUrl,
  streamMenswearFromFeedUrl,
  writeMenswearCache,
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

function sampleItems(items, limit) {
  if (!items?.length) return [];
  if (items.length <= limit) return items;
  // Round-robin by family so the stylist sees jackets + shirts + shoes, not one category
  const byFam = {};
  for (const item of items) {
    const fam = item.family || "other";
    if (!byFam[fam]) byFam[fam] = [];
    byFam[fam].push(item);
  }
  const fams = Object.keys(byFam);
  const out = [];
  let i = 0;
  while (out.length < limit && fams.some((f) => byFam[f].length)) {
    const fam = fams[i % fams.length];
    if (byFam[fam].length) out.push(byFam[fam].shift());
    i += 1;
  }
  return out;
}

exports.handler = async (event) => {
  const headers = corsHeaders();
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }
  if (event.httpMethod !== "POST" && event.httpMethod !== "GET") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  let body = {};
  if (event.httpMethod === "POST" && event.body) {
    try {
      body = JSON.parse(event.body);
    } catch {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid JSON" }) };
    }
  }

  const limit = Math.min(Math.max(Number(body.limit || body.maxProducts || 500), 20), 1200);
  const wantSync = Boolean(body.sync);

  try {
    if (wantSync) {
      const feedUrl = resolveFeedUrl();
      if (!feedUrl) {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            source: "backup",
            reason: "missing_feed_url",
            items: [],
            message: "Set AWIN_FEED_URL before forcing a sync.",
          }),
        };
      }
      const maxTotal = Math.min(Math.max(Number(process.env.AWIN_MAX_PRODUCTS || 4000), 100), 8000);
      const { items, meta } = await streamMenswearFromFeedUrl(feedUrl, {
        caps: DEFAULT_CAPS,
        maxTotal,
      });
      if (items.length) await writeMenswearCache({ items, meta });
    }

    const cache = await readMenswearCache();
    if (!cache?.items?.length) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          source: "backup",
          reason: resolveFeedUrl() ? "cache_empty" : "missing_feed_url",
          items: [],
          message: resolveFeedUrl()
            ? "Menswear cache empty — run /api/product-feed-sync (or wait for the daily job)."
            : "Set AWIN_FEED_URL in Netlify, then run product-feed-sync once.",
        }),
      };
    }

    const items = sampleItems(cache.items, limit);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        source: "awin",
        reason: null,
        count: items.length,
        cachedTotal: cache.items.length,
        fetchedAt: cache.meta?.fetchedAt || cache.fetchedAt || null,
        meta: cache.meta || null,
        items,
      }),
    };
  } catch (err) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        source: "backup",
        reason: "api_error",
        items: [],
        message: err?.message || "product-search failed",
      }),
    };
  }
};
