/**
 * One-shot live sync against AWIN_FEED_URL (never commit the URL/key).
 * Writes:
 *   - /tmp/vestra-awin-menswear-v1.json (local function-style cache)
 *   - public/data/menswear-catalog.json (durable site cache for product-search)
 *
 * Usage: AWIN_FEED_URL='https://productdata.awin.com/...' node scripts/sync-awin-feed-live.cjs
 */
const fs = require("fs");
const path = require("path");
const {
  streamMenswearFromFeedUrl,
  writeMenswearCache,
  readMenswearCache,
  DEFAULT_CAPS,
} = require("../netlify/functions/lib/awinMenswearFeed.cjs");
const {
  enrichCatalogItems,
  enrichmentEnabled,
} = require("../netlify/functions/lib/catalogEnrich.cjs");

async function main() {
  const feedUrl = String(process.env.AWIN_FEED_URL || "").trim();
  if (!feedUrl) {
    console.error("Set AWIN_FEED_URL first");
    process.exit(1);
  }
  if (!/^https:\/\/productdata\.awin\.com\//i.test(feedUrl)) {
    console.error("AWIN_FEED_URL must be an https://productdata.awin.com/... URL");
    process.exit(1);
  }

  console.log("Starting streamed sync…");
  const started = Date.now();
  const { items, meta } = await streamMenswearFromFeedUrl(feedUrl, {
    caps: DEFAULT_CAPS,
    maxTotal: Number(process.env.AWIN_MAX_PRODUCTS || 4000),
    onProgress: ({ scanned, kept }) => {
      console.log(`  progress scanned=${scanned} kept=${kept}`);
    },
  });
  console.log("meta", meta);
  console.log(`elapsed ${(Date.now() - started) / 1000}s`);

  if (!items.length) {
    console.error("No menswear items kept — check filters / feed");
    process.exit(2);
  }

  let finalItems = items;
  let enrichStats = { enabled: false };
  if (enrichmentEnabled()) {
    console.log("CATALOG_ENRICH=1 — running Claude enrichment pass…");
    const enriched = await enrichCatalogItems(items, {
      onProgress: (p) => console.log("  enrich", p),
    });
    finalItems = enriched.items;
    enrichStats = { enabled: true, ...enriched.stats };
    console.log("enrichment stats", enrichStats);
  } else {
    console.log("Skipping Claude enrichment (set CATALOG_ENRICH=1 to enable).");
  }

  const payload = {
    version: 1,
    source: "awin",
    items: finalItems,
    meta: { ...meta, enrichment: enrichStats },
  };
  const publicPath = path.join(__dirname, "..", "public", "data", "menswear-catalog.json");
  fs.mkdirSync(path.dirname(publicPath), { recursive: true });
  fs.writeFileSync(publicPath, JSON.stringify(payload));
  console.log("wrote", publicPath, "count", finalItems.length, "bytes", fs.statSync(publicPath).size);

  const stored = await writeMenswearCache(payload);
  console.log("local cache", stored);

  const cache = await readMenswearCache();
  console.log("sample", (cache?.items || []).slice(0, 3).map((i) => ({
    family: i.family,
    name: i.name,
    price: i.price,
    retailer: i.retailer,
    shopUrl: (i.shopUrl || "").slice(0, 80),
  })));

  if (!items.every((i) => i.shopUrl)) {
    process.exit(4);
  }
  console.log("LIVE OK count=" + items.length);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
