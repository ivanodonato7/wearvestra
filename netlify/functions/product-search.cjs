/**
 * product-search — serve cached Awin menswear (fast path).
 *
 * Primary cache: /data/menswear-catalog.json (shipped with the site after sync).
 * Secondary: Netlify Blobs (if connectLambda works).
 * Fallback: empty → client uses BACKUP_CATALOG.
 */
const {
  readMenswearCache,
  resolveFeedUrl,
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

function siteOrigin(event) {
  const proto = event.headers?.["x-forwarded-proto"] || "https";
  const host = event.headers?.["x-forwarded-host"] || event.headers?.host;
  if (host) return `${proto}://${host}`;
  return "https://wearvestra.com";
}

async function readStaticCatalog(event) {
  const url = `${siteOrigin(event)}/data/menswear-catalog.json`;
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (Array.isArray(data?.items) && data.items.length) return data;
  } catch (err) {
    console.error("readStaticCatalog failed", err?.message || err);
  }
  return null;
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

  try {
    let cache = await readStaticCatalog(event);
    let cacheVia = cache ? "static" : null;
    if (!cache) {
      cache = await readMenswearCache(event);
      if (cache) cacheVia = "blobs";
    }

    if (!cache?.items?.length) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          source: "backup",
          reason: resolveFeedUrl() ? "cache_empty" : "missing_feed_url",
          items: [],
          message: "Menswear cache empty — deploy public/data/menswear-catalog.json or run product-feed-sync.",
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
        cacheVia,
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
