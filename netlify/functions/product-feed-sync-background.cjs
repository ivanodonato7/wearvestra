/**
 * product-feed-sync-background — long-running Awin Create-a-Feed ingest.
 *
 * Netlify Background Function (returns 202 immediately, runs up to ~15 min).
 * Streams AWIN_FEED_URL, filters menswear, writes Netlify Blobs cache.
 *
 * Trigger: POST /api/product-feed-sync  (redirect → this function)
 * Schedule: daily 07:00 UTC
 */
const {
  streamMenswearFromFeedUrl,
  writeMenswearCache,
  resolveFeedUrl,
  DEFAULT_CAPS,
  writeSyncStatus,
} = require("./lib/awinMenswearFeed.cjs");

function authorized(event) {
  const secret = process.env.AWIN_SYNC_SECRET || "";
  if (!secret) return true;
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

  await writeSyncStatus({
    status: "running",
    startedAt: new Date().toISOString(),
  });

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
    await writeSyncStatus({ status: "failed", ...result });
    return result;
  }

  const stored = await writeMenswearCache({ items, meta });
  const result = {
    ok: true,
    source: "awin",
    count: items.length,
    meta,
    stored,
    finishedAt: new Date().toISOString(),
  };
  await writeSyncStatus({ status: "ok", ...result });
  return result;
}

exports.handler = async (event) => {
  // Background functions still receive the event; auth gate for manual POSTs
  if (event.httpMethod === "OPTIONS") return;
  if (event.httpMethod && event.httpMethod !== "POST" && event.httpMethod !== "GET") return;
  if (event.httpMethod && !authorized(event)) return;

  try {
    const result = await runSync();
    console.log("product-feed-sync-background", JSON.stringify({
      ok: result.ok,
      count: result.count,
      reason: result.reason,
      scanned: result.meta?.scanned,
    }));
  } catch (err) {
    console.error("product-feed-sync-background failed", err);
    try {
      await writeSyncStatus({
        status: "failed",
        ok: false,
        reason: "sync_error",
        message: err?.message || "Awin sync failed",
        finishedAt: new Date().toISOString(),
      });
    } catch {
      /* ignore */
    }
  }
};
