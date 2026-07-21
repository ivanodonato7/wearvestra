/**
 * Enrich a small batch of catalog items with Claude (for orchestrated full sync).
 * POST /api/catalog-enrich-batch
 * Body: { items: [{ key, name, brand?, category?, ... }], model? }
 *
 * Uses Netlify ANTHROPIC_API_KEY. Max 40 items per call (function timeout).
 */
const { enrichCatalogItems } = require("./lib/catalogEnrich.cjs");

const MAX_BATCH = 40;

function authorized(event) {
  const secret = process.env.AWIN_SYNC_SECRET || "";
  if (!secret) return true;
  const hdr = event.headers?.["x-vestra-sync-secret"] || event.headers?.["X-Vestra-Sync-Secret"] || "";
  return hdr === secret;
}

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, x-vestra-sync-secret",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "POST only" }) };
  }
  if (!authorized(event)) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: "unauthorized" }) };
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return { statusCode: 503, headers, body: JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }) };
  }

  let body = {};
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "items[] required" }) };
  }
  if (items.length > MAX_BATCH) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: `max ${MAX_BATCH} items per call`, got: items.length }),
    };
  }

  const slim = items.map((i) => ({
    key: i.key,
    name: i.name,
    brand: i.brand || i.retailer || null,
    category: i.category || null,
    family: i.family || null,
    retailer: i.retailer || null,
  }));

  try {
    const model = body.model || process.env.CATALOG_ENRICH_MODEL || "claude-haiku-4-5";
    const { items: enriched, stats } = await enrichCatalogItems(slim, {
      model,
      batchSize: Math.min(items.length, 20),
    });

    // Merge Claude tags back onto the original objects (preserve price/image/urls).
    const byKey = new Map(enriched.map((e) => [e.key, e]));
    const merged = items.map((orig) => {
      const e = byKey.get(orig.key);
      if (!e) return orig;
      return {
        ...orig,
        enrichmentOk: e.enrichmentOk,
        enrichmentConfidence: e.enrichmentConfidence,
        enrichment: e.enrichment,
        formality: e.formality,
        formalityBand: e.formalityBand,
        formalityLabel: e.formalityLabel,
        cut: e.cut,
        fit: e.fit,
        colors: e.colors,
        paletteTags: e.paletteTags,
        family: e.family || orig.family,
        type: e.type || orig.type,
        category: e.category || orig.category,
        categoryRaw: e.categoryRaw != null ? e.categoryRaw : orig.category,
      };
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true, count: merged.length, stats, items: merged }),
    };
  } catch (err) {
    return {
      statusCode: 502,
      headers,
      body: JSON.stringify({ error: String(err && err.message ? err.message : err) }),
    };
  }
};
