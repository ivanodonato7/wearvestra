/**
 * Full Awin sync + Claude enrichment (via Netlify proxy when local key is absent).
 *
 * Usage:
 *   AWIN_FEED_URL=… CATALOG_ENRICH_PROXY=https://deploy-preview-N--site.netlify.app \
 *     node scripts/run-full-enriched-sync.cjs
 *
 * Or with a local key:
 *   AWIN_FEED_URL=… ANTHROPIC_API_KEY=… CATALOG_ENRICH=1 node scripts/sync-awin-feed-live.cjs
 */
const fs = require("fs");
const path = require("path");
const {
  streamMenswearFromFeedUrl,
  writeMenswearCache,
  DEFAULT_CAPS,
} = require("../netlify/functions/lib/awinMenswearFeed.cjs");
const {
  enrichCatalogItems,
  enrichmentEnabled,
} = require("../netlify/functions/lib/catalogEnrich.cjs");

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function enrichViaProxy(items, proxyBase, opts = {}) {
  const batchSize = opts.batchSize || 20;
  const batches = chunk(items, batchSize);
  const out = [];
  let inputTokens = 0;
  let outputTokens = 0;
  let enrichedOk = 0;
  let enrichedLowConfidence = 0;
  let failed = 0;
  let model = opts.model || "claude-haiku-4-5";

  for (let b = 0; b < batches.length; b += 1) {
    const batch = batches[b];
    const url = `${proxyBase.replace(/\/$/, "")}/api/catalog-enrich-batch`;
    const headers = { "content-type": "application/json" };
    if (process.env.AWIN_SYNC_SECRET) {
      headers["x-vestra-sync-secret"] = process.env.AWIN_SYNC_SECRET;
    }
    let attempt = 0;
    let data = null;
    while (attempt < 3) {
      attempt += 1;
      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({ items: batch, model }),
      });
      const text = await res.text();
      try {
        data = JSON.parse(text);
      } catch {
        data = { error: text.slice(0, 200) };
      }
      if (res.ok && data.ok) break;
      console.warn(`  batch ${b + 1}/${batches.length} attempt ${attempt} failed:`, data.error || res.status);
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
    if (!data?.ok) {
      failed += batch.length;
      out.push(...batch.map((i) => ({
        ...i,
        enrichmentOk: false,
        enrichmentConfidence: "low",
        enrichment: { enrichmentNote: "proxy batch failed", enrichmentSource: "claude" },
      })));
    } else {
      out.push(...data.items);
      const s = data.stats || {};
      model = s.model || model;
      inputTokens += s.inputTokens || 0;
      outputTokens += s.outputTokens || 0;
      enrichedOk += s.enrichedOk || 0;
      enrichedLowConfidence += s.enrichedLowConfidence || 0;
      failed += s.failed || 0;
    }
    console.log(
      `  enrich batch ${b + 1}/${batches.length} ok=${enrichedOk} low=${enrichedLowConfidence} fail=${failed}`,
    );
    // gentle pacing
    await new Promise((r) => setTimeout(r, 200));
  }

  return {
    items: out,
    stats: {
      model,
      batchSize,
      requested: items.length,
      enrichedOk,
      enrichedLowConfidence,
      failed,
      inputTokens,
      outputTokens,
      estimatedUsd: Number((((inputTokens / 1e6) * 1.0) + ((outputTokens / 1e6) * 5.0)).toFixed(4)),
      via: "proxy",
      proxy: proxyBase,
    },
  };
}

async function main() {
  const feedUrl = String(process.env.AWIN_FEED_URL || "").trim();
  const proxy = String(process.env.CATALOG_ENRICH_PROXY || "").trim();
  const skipAwin = String(process.env.SKIP_AWIN || "").trim() === "1";
  const publicPath = path.join(__dirname, "..", "public", "data", "menswear-catalog.json");

  let items;
  let meta;

  if (skipAwin && fs.existsSync(publicPath)) {
    console.log("SKIP_AWIN=1 — loading existing catalog");
    const existing = JSON.parse(fs.readFileSync(publicPath, "utf8"));
    items = existing.items || [];
    meta = { ...(existing.meta || {}), reusedStatic: true };
  } else {
    if (!feedUrl) {
      console.error("Set AWIN_FEED_URL (or SKIP_AWIN=1 with existing catalog)");
      process.exit(1);
    }
    console.log("Starting Awin streamed sync…");
    const started = Date.now();
    const streamed = await streamMenswearFromFeedUrl(feedUrl, {
      caps: DEFAULT_CAPS,
      maxTotal: Number(process.env.AWIN_MAX_PRODUCTS || 4000),
      onProgress: ({ scanned, kept }) => {
        if (scanned % 5000 === 0) console.log(`  progress scanned=${scanned} kept=${kept}`);
      },
    });
    items = streamed.items;
    meta = streamed.meta;
    console.log("awin meta", meta);
    console.log(`awin elapsed ${(Date.now() - started) / 1000}s count=${items.length}`);
  }

  if (!items.length) {
    console.error("No items to enrich");
    process.exit(2);
  }

  let finalItems = items;
  let enrichStats = { enabled: false };

  const wantEnrich = enrichmentEnabled() || Boolean(proxy) || Boolean(process.env.ANTHROPIC_API_KEY);
  if (!wantEnrich) {
    console.error("Set CATALOG_ENRICH=1 and/or CATALOG_ENRICH_PROXY / ANTHROPIC_API_KEY");
    process.exit(3);
  }

  console.log(`Enriching ${items.length} items…`);
  if (process.env.ANTHROPIC_API_KEY) {
    const enriched = await enrichCatalogItems(items, {
      onProgress: (p) => console.log("  enrich", p),
    });
    finalItems = enriched.items;
    enrichStats = { enabled: true, ...enriched.stats, via: "local" };
  } else if (proxy) {
    const enriched = await enrichViaProxy(items, proxy, {
      batchSize: Number(process.env.CATALOG_ENRICH_BATCH || 20),
      model: process.env.CATALOG_ENRICH_MODEL || "claude-haiku-4-5",
    });
    finalItems = enriched.items;
    enrichStats = { enabled: true, ...enriched.stats };
  } else {
    console.error("No ANTHROPIC_API_KEY and no CATALOG_ENRICH_PROXY");
    process.exit(3);
  }

  console.log("enrichment stats", enrichStats);

  const payload = {
    version: 1,
    source: "awin",
    items: finalItems,
    meta: {
      ...meta,
      enrichment: enrichStats,
      enrichedAt: new Date().toISOString(),
    },
  };

  fs.mkdirSync(path.dirname(publicPath), { recursive: true });
  fs.writeFileSync(publicPath, JSON.stringify(payload));
  console.log("wrote", publicPath, "count", finalItems.length, "bytes", fs.statSync(publicPath).size);

  const stored = await writeMenswearCache(payload);
  console.log("local cache", stored);

  const ok = finalItems.filter((i) => i.enrichmentOk).length;
  const low = finalItems.filter((i) => i.enrichmentConfidence === "low" || i.enrichmentOk === false).length;
  const sample = finalItems
    .filter((i) => i.enrichmentOk)
    .slice(0, 12)
    .map((i) => ({
      name: i.name,
      formality: i.formalityLabel,
      colors: i.colors || i.paletteTags,
      fit: i.fit || i.cut,
      category: i.family || i.category,
      confidence: i.enrichmentConfidence,
    }));

  const report = {
    ok: true,
    count: finalItems.length,
    enrichedOk: ok,
    lowOrFailed: low,
    enrichment: enrichStats,
    sample,
  };
  const reportPath = "/opt/cursor/artifacts/catalog-enrich-full-report.json";
  try {
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log("wrote report", reportPath);
  } catch (err) {
    console.warn("report write failed", err.message);
  }

  console.log(JSON.stringify({
    LIVE_OK: true,
    count: finalItems.length,
    enrichedOk: ok,
    lowOrFailed: low,
    estimatedUsd: enrichStats.estimatedUsd,
    model: enrichStats.model,
  }));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
