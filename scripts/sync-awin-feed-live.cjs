#!/usr/bin/env node
/**
 * One-shot live sync against AWIN_FEED_URL (never commit the URL/key).
 * Usage: AWIN_FEED_URL='https://productdata.awin.com/...' node scripts/sync-awin-feed-live.cjs
 */
const {
  streamMenswearFromFeedUrl,
  writeMenswearCache,
  readMenswearCache,
  DEFAULT_CAPS,
} = require("../netlify/functions/lib/awinMenswearFeed.cjs");
const productSearch = require("../netlify/functions/product-search.cjs");

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

  const stored = await writeMenswearCache({ items, meta });
  console.log("stored", stored);

  const cache = await readMenswearCache();
  const withLinks = (cache.items || []).filter((i) => /awin1\.com|awin\.com|productdata/i.test(i.shopUrl || ""));
  console.log("cache total", cache.items.length, "with awin-ish links", withLinks.length);
  console.log("sample", cache.items.slice(0, 5).map((i) => ({
    family: i.family,
    name: i.name,
    price: i.price,
    retailer: i.retailer,
    shopUrl: (i.shopUrl || "").slice(0, 80),
  })));

  const res = await productSearch.handler({
    httpMethod: "POST",
    body: JSON.stringify({ limit: 20 }),
  });
  const body = JSON.parse(res.body);
  console.log("product-search", {
    status: res.statusCode,
    source: body.source,
    count: body.count,
    cachedTotal: body.cachedTotal,
    firstLink: body.items?.[0]?.shopUrl?.slice(0, 100),
    families: [...new Set((body.items || []).map((i) => i.family))],
  });

  if (body.source !== "awin" || !body.items?.length) {
    process.exit(3);
  }
  if (!body.items.every((i) => i.shopUrl)) {
    process.exit(4);
  }
  console.log("LIVE OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
