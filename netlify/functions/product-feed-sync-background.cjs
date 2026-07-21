/**
 * product-feed-sync-background — long-running Awin Create-a-Feed ingest.
 *
 * Tries Netlify Blobs (needs connectLambda). The reliable production cache is
 * public/data/menswear-catalog.json, refreshed via:
 *   AWIN_FEED_URL=… node scripts/sync-awin-feed-live.cjs
 * then commit/deploy that file.
 */
const fs = require("fs");
const path = require("path");
const {
  streamMenswearFromFeedUrl,
  writeMenswearCache,
  resolveFeedUrl,
  DEFAULT_CAPS,
  writeSyncStatus,
} = require("./lib/awinMenswearFeed.cjs");
const {
  enrichCatalogItems,
  enrichmentEnabled,
} = require("./lib/catalogEnrich.cjs");

function authorized(event) {
  const secret = process.env.AWIN_SYNC_SECRET || "";
  if (!secret) return true;
  const hdr = event.headers?.["x-vestra-sync-secret"] || event.headers?.["X-Vestra-Sync-Secret"] || "";
  return hdr === secret;
}

async function runSync(event) {
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

  try {
    await writeSyncStatus({ status: "running", startedAt: new Date().toISOString() }, event);
  } catch (err) {
    console.error("status write failed (continuing)", err?.message || err);
  }

  const maxTotal = Math.min(Math.max(Number(process.env.AWIN_MAX_PRODUCTS || 4000), 100), 8000);
  const { items, meta } = await streamMenswearFromFeedUrl(feedUrl, {
    caps: DEFAULT_CAPS,
    maxTotal,
  });

  if (!items.length) {
    const result = {
      ok: false,
      reason: "empty_after_filter",
      meta,
      message: "Feed downloaded but no menswear rows matched filters.",
      finishedAt: new Date().toISOString(),
    };
    try { await writeSyncStatus({ status: "failed", ...result }, event); } catch { /* ignore */ }
    return result;
  }

  // Claude enrichment pass (formality / colors / fit / category).
  // Enabled when CATALOG_ENRICH=1 (set in netlify.toml build.environment).
  let enrichStats = { enabled: false };
  let finalItems = items;
  if (enrichmentEnabled()) {
    try {
      const enriched = await enrichCatalogItems(items, {
        onProgress: (p) => console.log("enrich", JSON.stringify(p)),
      });
      finalItems = enriched.items;
      enrichStats = { enabled: true, ...enriched.stats };
    } catch (err) {
      console.error("enrichment failed (continuing with raw items)", err?.message || err);
      enrichStats = { enabled: true, error: err?.message || String(err) };
    }
  }

  let stored = null;
  try {
    stored = await writeMenswearCache({ items: finalItems, meta: { ...meta, enrichment: enrichStats } }, event);
  } catch (err) {
    console.error("blobs write failed", err?.message || err);
    try {
      fs.writeFileSync(
        path.join("/tmp", "vestra-awin-menswear-v1.json"),
        JSON.stringify({ version: 1, source: "awin", items: finalItems, meta: { ...meta, enrichment: enrichStats } }),
      );
      stored = { via: "tmp-only", error: err?.message || String(err) };
    } catch { /* ignore */ }
  }

  const result = {
    ok: true,
    source: "awin",
    count: finalItems.length,
    meta: { ...meta, enrichment: enrichStats },
    enrichment: enrichStats,
    stored,
    finishedAt: new Date().toISOString(),
  };
  try { await writeSyncStatus({ status: "ok", ...result }, event); } catch { /* ignore */ }
  return result;
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return;
  if (event.httpMethod && event.httpMethod !== "POST" && event.httpMethod !== "GET") return;
  if (event.httpMethod && !authorized(event)) return;

  try {
    const result = await runSync(event);
    console.log("product-feed-sync-background", JSON.stringify({
      ok: result.ok,
      count: result.count,
      reason: result.reason,
      scanned: result.meta?.scanned,
      stored: result.stored,
    }));
  } catch (err) {
    console.error("product-feed-sync-background failed", err);
  }
};
