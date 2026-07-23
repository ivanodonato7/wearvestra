/**
 * Expand menswear catalog from Awin Product Feed List + Create-a-Feed.
 *
 * Awin has no public "join programme" API. This script:
 *  1. Downloads the Product Feed List (all feeds reachable with AWIN_FEED_URL apikey)
 *  2. Selects menswear-relevant Fashion / clothing merchants (US/GB/IE + existing)
 *  3. Streams each merchant feed (fid URL) + the existing Create-a-Feed cid URL
 *  4. Reservoir-samples with raised caps + per-merchant diversity
 *  5. Claude-Haiku enriches ONLY new / previously-unenriched items
 *  6. Writes public/data/menswear-catalog.json + a JSON report
 *
 * Usage:
 *   AWIN_FEED_URL='…' ANTHROPIC_API_KEY='…' CATALOG_ENRICH=1 \
 *     node scripts/expand-awin-menswear-catalog.cjs
 */
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const readline = require("readline");
const { Readable } = require("stream");
const {
  streamMenswearFromFeedUrl,
  writeMenswearCache,
  normalizeRow,
  DEFAULT_CAPS,
} = require("../netlify/functions/lib/awinMenswearFeed.cjs");
const {
  enrichCatalogItems,
  enrichmentEnabled,
} = require("../netlify/functions/lib/catalogEnrich.cjs");

const ROOT = path.join(__dirname, "..");
const OUT_CATALOG = path.join(ROOT, "public", "data", "menswear-catalog.json");
const OUT_REPORT = path.join("/opt/cursor/artifacts", "awin-catalog-expand-report.json");
const CANDIDATES_PATH = path.join("/tmp", "awin-menswear-expand-candidates.json");

/** Raised caps — especially weak categories (shoe/belt/scarf/sunglasses). */
const EXPAND_CAPS = {
  blazer: 700,
  shirt: 900,
  trouser: 750,
  shoe: 800,
  belt: 220,
  scarf: 140,
  sunglasses: 140,
};

/** Soft per-merchant ceiling so one wholesale dump can't own a family. */
const PER_MERCHANT_FAMILY = {
  blazer: 120,
  shirt: 140,
  trouser: 120,
  shoe: 100,
  belt: 40,
  scarf: 30,
  sunglasses: 40,
};

const EXCLUDE_NAME =
  /jewel|watch|bracelet|parfum|perfume|lingerie|maternity|baby|pet\b|vet\b|decor|raam|spiegel|mirror|homeart|promo|custom.?print|motor|ali.?express|workout.?for.?less|plusshop|ecosusi|mustard.?seed|santean|efui|parfivo|skinwork|glamory|omara|clovis|unipolar|fazari|macian|goe\b|chiko|new.?marine|converse.?pl|babista|mirlux|deluxehome/i;

const INCLUDE_NAME =
  /fashion|cloth|suit|shirt|shoe|boot|wear|mens|men'?s|blazer|tailor|formal|belt|sunglass|eyewear|apparel|outfit|style|lux|vintage|seldom|nardoni|emensuit|cerqular|santoro|viaduct|brian.?james|t\.?luxy|dima.?eye|some.?slight|lucasgift|chargrill|tooled|fashiontamer|albert|planet.?deluxe|moh\b/i;

const PREFERRED_REGIONS = new Set(["US", "GB", "IE", "CA", "AU", "DE", "FR", "IT", "NL", "ES", "AT", "CH"]);

function parseCSV(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    const n = text[i + 1];
    if (q) {
      if (c === '"' && n === '"') {
        cell += '"';
        i += 1;
      } else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (c !== "\r") cell += c;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function extractApiKey(feedUrl) {
  const m = String(feedUrl).match(/apikey\/([^/]+)/i);
  if (!m) throw new Error("AWIN_FEED_URL missing apikey segment");
  return m[1];
}

async function downloadFeedList(apiKey) {
  const url =
    `https://productdata.awin.com/datafeed/list/apikey/${apiKey}/language/en/format/csv/delimiter/%2C/`;
  console.log("Fetching product feed list…");
  const res = await fetch(url);
  if (!res.ok) throw new Error(`feed list HTTP ${res.status}`);
  const text = await res.text();
  const rows = parseCSV(text);
  const header = rows[0].map((h) => String(h || "").replace(/^"|"$/g, ""));
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  const data = rows.slice(1).filter((r) => r.length > 3).map((r) => ({
    advertiserId: r[idx["Advertiser ID"]],
    name: r[idx["Advertiser Name"]],
    region: r[idx["Primary Region"]],
    status: r[idx["Membership Status"]],
    feedId: r[idx["Feed ID"]],
    feedName: r[idx["Feed Name"]],
    vertical: r[idx["Vertical"]],
    products: Number(r[idx["No of products"]] || 0),
    url: r[idx["URL"]],
  }));
  // Largest feed per advertiser
  const byAdv = new Map();
  for (const d of data) {
    const prev = byAdv.get(d.advertiserId);
    if (!prev || d.products > prev.products) byAdv.set(d.advertiserId, d);
  }
  return { all: data, unique: [...byAdv.values()] };
}

function selectCandidates(unique, existingMerchantIds) {
  const selected = unique.filter((d) => {
    if (EXCLUDE_NAME.test(d.name)) return false;
    if (!PREFERRED_REGIONS.has(d.region)) return false;
    if (existingMerchantIds.has(d.advertiserId)) return d.products >= 20;
    if (d.vertical === "Fashion") return d.products >= 200;
    if (INCLUDE_NAME.test(d.name)) return d.products >= 400;
    return false;
  });
  // Drop MOH (jewelry) etc. that slipped through
  return selected
    .filter((d) => !/\bMOH\b/.test(d.name))
    .sort((a, b) => b.products - a.products);
}

function splitCsvLine(line) {
  const out = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    const next = line[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') inQuotes = false;
      else field += ch;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      out.push(field);
      field = "";
      continue;
    }
    field += ch;
  }
  out.push(field);
  return out;
}

function detectDelimiter(headerLine) {
  const commas = (headerLine.match(/,/g) || []).length;
  const pipes = (headerLine.match(/\|/g) || []).length;
  return pipes > commas ? "|" : ",";
}

function splitLine(line, delimiter) {
  if (delimiter === ",") return splitCsvLine(line);
  return line.split(delimiter);
}

async function streamFeedToBuckets(feedUrl, buckets, familySeen, merchantFam, seen, caps, label) {
  const res = await fetch(feedUrl, {
    headers: { "user-agent": "VestraMenswearSync/1.0", accept: "*/*" },
  });
  if (!res.ok) {
    console.warn(`  skip ${label}: HTTP ${res.status}`);
    return { scanned: 0, kept: 0, label, ok: false };
  }
  const nodeIn = Readable.fromWeb(res.body);
  const encoding = String(res.headers.get("content-encoding") || "").toLowerCase();
  let stream = nodeIn;
  if (String(feedUrl).includes("compression/gzip") && !encoding.includes("gzip")) {
    stream = nodeIn.pipe(zlib.createGunzip());
  }
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  let headers = null;
  let delimiter = ",";
  let scanned = 0;
  let kept = 0;
  try {
    for await (const line of rl) {
      if (!line || !String(line).trim()) continue;
      if (!headers) {
        const headerLine = String(line).replace(/^\uFEFF/, "");
        delimiter = detectDelimiter(headerLine);
        headers = splitLine(headerLine, delimiter).map((h) =>
          String(h || "")
            .trim()
            .toLowerCase()
            .replace(/\s+/g, "_")
            .replace(/:/g, "_")
            .replace(/%3a/gi, "_"),
        );
        continue;
      }
      scanned += 1;
      const cols = splitLine(line, delimiter);
      const row = {};
      headers.forEach((h, i) => {
        row[h] = cols[i] != null ? String(cols[i]).trim() : "";
      });
      const item = normalizeRow(row);
      if (!item) continue;
      if (seen.has(item.id)) continue;
      const fam = item.family;
      const bucket = buckets[fam];
      if (!bucket) continue;
      const mid = String(item.merchantId || "unknown");
      const mKey = `${mid}:${fam}`;
      const mCount = merchantFam.get(mKey) || 0;
      const mCap = PER_MERCHANT_FAMILY[fam] || 80;
      if (mCount >= mCap && bucket.length >= (caps[fam] || 0)) continue;

      familySeen[fam] = (familySeen[fam] || 0) + 1;
      const cap = caps[fam] || 0;
      if (bucket.length < cap) {
        seen.add(item.id);
        bucket.push(item);
        merchantFam.set(mKey, mCount + 1);
        kept += 1;
      } else {
        const j = Math.floor(Math.random() * familySeen[fam]);
        if (j < cap) {
          const prev = bucket[j];
          if (prev?.id) seen.delete(prev.id);
          if (prev?.merchantId) {
            const pk = `${prev.merchantId}:${fam}`;
            merchantFam.set(pk, Math.max(0, (merchantFam.get(pk) || 1) - 1));
          }
          seen.add(item.id);
          bucket[j] = item;
          merchantFam.set(mKey, mCount + 1);
          kept += 1;
        }
      }
    }
  } finally {
    rl.close();
    try {
      stream.destroy?.();
    } catch {
      /* ignore */
    }
  }
  console.log(`  ${label}: scanned=${scanned} added≈${kept} bucketTotals=${JSON.stringify(Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, v.length])))}`);
  return { scanned, kept, label, ok: true };
}

function familyBreakdown(items) {
  const by = {};
  for (const i of items) by[i.family] = (by[i.family] || 0) + 1;
  return by;
}

function merchantBreakdown(items) {
  const by = {};
  for (const i of items) {
    const k = i.retailer || i.brand || i.merchantId || "?";
    by[k] = (by[k] || 0) + 1;
  }
  return Object.entries(by).sort((a, b) => b[1] - a[1]);
}

async function main() {
  const feedUrl = String(process.env.AWIN_FEED_URL || "").trim();
  if (!feedUrl) {
    console.error("Set AWIN_FEED_URL");
    process.exit(1);
  }
  if (!enrichmentEnabled() && !process.env.ANTHROPIC_API_KEY) {
    console.error("Set CATALOG_ENRICH=1 and ANTHROPIC_API_KEY (or CATALOG_ENRICH_PROXY)");
    process.exit(1);
  }

  const before = fs.existsSync(OUT_CATALOG)
    ? JSON.parse(fs.readFileSync(OUT_CATALOG, "utf8"))
    : { items: [], meta: {} };
  const beforeItems = before.items || [];
  const beforeByKey = new Map(beforeItems.map((i) => [i.key || `aw-${i.id}`, i]));
  const beforeMerchants = new Set(beforeItems.map((i) => String(i.merchantId || "")).filter(Boolean));
  const beforeFamilies = familyBreakdown(beforeItems);

  const apiKey = extractApiKey(feedUrl);
  const { unique } = await downloadFeedList(apiKey);
  const candidates = selectCandidates(unique, beforeMerchants);
  fs.writeFileSync(CANDIDATES_PATH, JSON.stringify(candidates, null, 2));

  const newMerchants = candidates.filter((c) => !beforeMerchants.has(c.advertiserId));
  const existingMerchants = candidates.filter((c) => beforeMerchants.has(c.advertiserId));
  console.log(`Candidates: ${candidates.length} (new=${newMerchants.length}, alreadyInCatalog=${existingMerchants.length})`);
  console.log("NEW:", newMerchants.map((m) => `${m.name} [${m.region}] products=${m.products}`).join("\n  "));

  const caps = EXPAND_CAPS;
  const buckets = Object.fromEntries(Object.keys(caps).map((k) => [k, []]));
  const familySeen = Object.fromEntries(Object.keys(caps).map((k) => [k, 0]));
  const merchantFam = new Map();
  const seen = new Set();

  // 1) Existing Create-a-Feed (cid) — broad joined coverage
  console.log("\nStreaming Create-a-Feed (cid)…");
  await streamFeedToBuckets(feedUrl, buckets, familySeen, merchantFam, seen, caps, "create-a-feed-cid");

  // 2) Explicit merchant feeds (new + existing fashion) for breadth / accessories
  console.log("\nStreaming merchant fid feeds…");
  const feedStats = [];
  for (const m of candidates) {
    const stats = await streamFeedToBuckets(
      m.url,
      buckets,
      familySeen,
      merchantFam,
      seen,
      caps,
      `${m.advertiserId}:${m.name.slice(0, 40)}`,
    );
    feedStats.push({ ...stats, advertiserId: m.advertiserId, name: m.name, isNew: !beforeMerchants.has(m.advertiserId) });
  }

  let items = Object.values(buckets).flat();
  console.log(`\nRaw merged items: ${items.length}`, familyBreakdown(items));

  // Preserve prior enrichment when key already enriched successfully
  items = items.map((item) => {
    const key = item.key || `aw-${item.id}`;
    const prev = beforeByKey.get(key);
    if (prev && prev.enrichmentOk && prev.enrichmentConfidence !== "low") {
      return {
        ...item,
        ...prev,
        // keep freshest shop/image/price from new scrape
        price: item.price ?? prev.price,
        image: item.image || prev.image,
        shopUrl: item.shopUrl || prev.shopUrl,
        clickUrl: item.clickUrl || prev.clickUrl,
        name: item.name || prev.name,
        retailer: item.retailer || prev.retailer,
        brand: item.brand || prev.brand,
      };
    }
    return item;
  });

  const needsEnrich = items.filter(
    (i) => !(i.enrichmentOk && i.enrichmentConfidence && i.enrichmentConfidence !== "low"),
  );
  console.log(`Enrichment needed: ${needsEnrich.length} / ${items.length}`);

  let enrichStats = { enabled: false };
  if (needsEnrich.length) {
    process.env.CATALOG_ENRICH = "1";
    const enriched = await enrichCatalogItems(needsEnrich, {
      onProgress: (p) => console.log("  enrich", p),
    });
    const byKey = new Map(enriched.items.map((i) => [i.key || `aw-${i.id}`, i]));
    items = items.map((i) => byKey.get(i.key || `aw-${i.id}`) || i);
    enrichStats = { enabled: true, ...enriched.stats };
    // Drop low-confidence "other" junk after enrichment
    const beforeDrop = items.length;
    items = items.filter((i) => {
      if (i.enrichment?.categoryCorrected === "other") return false;
      if (i.family && !EXPAND_CAPS[i.family]) return false;
      return true;
    });
    console.log(`Dropped ${beforeDrop - items.length} other/junk after enrich; kept ${items.length}`);
  }

  const afterFamilies = familyBreakdown(items);
  const afterMerchants = merchantBreakdown(items);
  const afterMerchantIds = new Set(items.map((i) => String(i.merchantId || "")).filter(Boolean));
  const newlyAppearingMerchants = [...afterMerchantIds].filter((id) => !beforeMerchants.has(id));

  const payload = {
    version: 1,
    source: "awin",
    items,
    meta: {
      scanned: feedStats.reduce((n, s) => n + (s.scanned || 0), 0),
      kept: items.length,
      byFamily: afterFamilies,
      fetchedAt: new Date().toISOString(),
      feedHost: "productdata.awin.com",
      expand: {
        beforeCount: beforeItems.length,
        afterCount: items.length,
        beforeFamilies,
        afterFamilies,
        beforeMerchantCount: beforeMerchants.size,
        afterMerchantCount: afterMerchantIds.size,
        newMerchantIds: newlyAppearingMerchants,
        newMerchantNames: afterMerchants
          .filter(([, ,]) => false)
          .concat(
            newlyAppearingMerchants.map((id) => {
              const sample = items.find((i) => String(i.merchantId) === id);
              return [sample?.retailer || id, items.filter((i) => String(i.merchantId) === id).length];
            }),
          ),
        candidates: candidates.map((c) => ({
          advertiserId: c.advertiserId,
          name: c.name,
          region: c.region,
          products: c.products,
          vertical: c.vertical,
          wasInCatalog: beforeMerchants.has(c.advertiserId),
        })),
        feedStats,
        caps: EXPAND_CAPS,
      },
      enrichment: enrichStats,
    },
  };

  // Fix newMerchantNames properly
  payload.meta.expand.newMerchantNames = newlyAppearingMerchants.map((id) => {
    const sample = items.find((i) => String(i.merchantId) === id);
    const count = items.filter((i) => String(i.merchantId) === id).length;
    return { merchantId: id, name: sample?.retailer || id, count };
  });

  fs.mkdirSync(path.dirname(OUT_CATALOG), { recursive: true });
  fs.writeFileSync(OUT_CATALOG, JSON.stringify(payload));
  await writeMenswearCache(payload);
  fs.mkdirSync(path.dirname(OUT_REPORT), { recursive: true });
  fs.writeFileSync(OUT_REPORT, JSON.stringify({
    before: { count: beforeItems.length, families: beforeFamilies, merchants: beforeMerchants.size },
    after: { count: items.length, families: afterFamilies, merchants: afterMerchantIds.size, topRetailers: afterMerchants.slice(0, 30) },
    newMerchants: payload.meta.expand.newMerchantNames,
    candidatesConsidered: candidates.length,
    enrichment: enrichStats,
    note: "Awin has no public join-programme API; expansion uses Product Feed List downloads reachable with the publisher product-data apikey (deep links use a=2994719). Confirm programme membership in the Awin UI for commission on newly ingested merchants.",
  }, null, 2));

  console.log("\n=== EXPAND SUMMARY ===");
  console.log(`Before: ${beforeItems.length} items, ${beforeMerchants.size} merchants`, beforeFamilies);
  console.log(`After:  ${items.length} items, ${afterMerchantIds.size} merchants`, afterFamilies);
  console.log("New merchants:", payload.meta.expand.newMerchantNames);
  console.log("Wrote", OUT_CATALOG, "and", OUT_REPORT);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
