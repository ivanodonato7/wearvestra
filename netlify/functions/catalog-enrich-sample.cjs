/**
 * One-shot: enrich 10 sample items from the static catalog with Claude.
 * Used to sanity-check tag quality before enabling CATALOG_ENRICH=1 on full sync.
 *
 * GET/POST /api/catalog-enrich-sample
 */
const fs = require("fs");
const path = require("path");
const { enrichCatalogItems, estimateFullCatalogCost } = require("./lib/catalogEnrich.cjs");

function pickSample(items, n = 10) {
  const want = [
    { re: /\b(blazer|sport\s*coat)\b/i, fam: "blazer" },
    { re: /\bdress\s*shirt\b/i, fam: "shirt" },
    { re: /\b(chino|trousers?)\b/i, fam: "trouser" },
    { re: /\b(dress\s*shoe|loafer|wingtip|derby)\b/i, fam: "shoe" },
    { re: /\b(hoodie|sweatshirt)\b/i, fam: "shirt" },
    { re: /\b(jogger|athletic\s*shorts?|gym\s*shorts?)\b/i, fam: "trouser" },
    { re: /\b(sneaker|trainer)\b/i, fam: "shoe" },
    { re: /\b(polo|t-?shirt)\b/i, fam: "shirt" },
    { re: /\bbelts?\b/i, fam: "belt" },
    { re: /\bcargo\b/i, fam: "trouser" },
  ];
  const picked = [];
  const used = new Set();
  for (const row of want) {
    const hit = items.find((i) => {
      if (used.has(i.key)) return false;
      if (!row.re.test(i.name || "")) return false;
      if (row.fam && i.family && i.family !== row.fam && row.fam !== "belt") return false;
      return true;
    }) || items.find((i) => row.re.test(i.name || "") && !used.has(i.key));
    if (hit) {
      used.add(hit.key);
      picked.push(hit);
    }
  }
  for (const i of items) {
    if (picked.length >= n) break;
    if (!used.has(i.key)) {
      used.add(i.key);
      picked.push(i);
    }
  }
  return picked.slice(0, n);
}

function loadStaticCatalogFromDisk() {
  const candidates = [
    path.join(__dirname, "..", "..", "public", "data", "menswear-catalog.json"),
    path.join(__dirname, "..", "..", "dist", "data", "menswear-catalog.json"),
    path.join(process.cwd(), "public", "data", "menswear-catalog.json"),
    path.join(process.cwd(), "dist", "data", "menswear-catalog.json"),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        const raw = JSON.parse(fs.readFileSync(p, "utf8"));
        return Array.isArray(raw) ? raw : (raw.items || []);
      }
    } catch { /* try next */ }
  }
  return [];
}

async function loadStaticCatalog(event) {
  const fromDisk = loadStaticCatalogFromDisk();
  if (fromDisk.length) return fromDisk;

  // On Netlify, functions don't ship the publish dir — fetch the static asset.
  const host = event.headers?.["x-forwarded-host"]
    || event.headers?.host
    || event.headers?.Host
    || "";
  const proto = event.headers?.["x-forwarded-proto"] || "https";
  const urls = [];
  if (host) urls.push(`${proto}://${host}/data/menswear-catalog.json`);
  urls.push("https://wearvestra.com/data/menswear-catalog.json");
  urls.push("https://www.wearvestra.com/data/menswear-catalog.json");

  for (const url of urls) {
    try {
      const res = await fetch(url, { headers: { accept: "application/json" } });
      if (!res.ok) continue;
      const raw = await res.json();
      const items = Array.isArray(raw) ? raw : (raw.items || []);
      if (items.length) return items;
    } catch { /* try next */ }
  }
  return [];
}

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      statusCode: 503,
      headers,
      body: JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }),
    };
  }

  const items = await loadStaticCatalog(event);
  if (!items.length) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "static catalog missing" }),
    };
  }

  const cost = {
    haiku: estimateFullCatalogCost({ itemCount: items.length, model: "claude-haiku-4-5" }),
    sonnet: estimateFullCatalogCost({ itemCount: items.length, model: "claude-sonnet-4-6" }),
  };

  const sample = pickSample(items, 10);
  try {
    const { items: enriched, stats } = await enrichCatalogItems(sample, { limit: 10 });
    const report = enriched.map((i) => ({
      key: i.key,
      name: i.name,
      brand: i.brand,
      awinCategory: i.categoryRaw || i.category,
      enrichment: {
        formality: i.formalityLabel || i.enrichment?.formalityLabel,
        formalityScore: i.formality,
        colors: i.colors || i.paletteTags || [],
        fit: i.fit || i.cut,
        category: i.category,
        confidence: i.enrichmentConfidence,
        note: i.enrichment?.enrichmentNote || null,
      },
    }));
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        costEstimateFullCatalog: cost,
        sampleStats: stats,
        sample: report,
        note: "Full-catalog enrichment is gated by CATALOG_ENRICH=1 and was NOT run.",
      }),
    };
  } catch (err) {
    return {
      statusCode: 502,
      headers,
      body: JSON.stringify({ error: String(err.message || err), costEstimateFullCatalog: cost }),
    };
  }
};
