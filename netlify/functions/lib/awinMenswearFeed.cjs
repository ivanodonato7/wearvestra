/**
 * Shared Awin Create-a-Feed streaming parser → Vestra menswear items.
 * Used by product-feed-sync (write cache) and product-search (read cache).
 */
const zlib = require("zlib");
const { Readable } = require("stream");
const readline = require("readline");
const fs = require("fs");
const path = require("path");

const CACHE_STORE = "vestra-catalog";
const CACHE_KEY = "menswear-v1";
const SYNC_STATUS_KEY = "menswear-sync-status-v1";
const LOCAL_CACHE_PATH = path.join("/tmp", "vestra-awin-menswear-v1.json");
const LOCAL_SYNC_PATH = path.join("/tmp", "vestra-awin-sync-status-v1.json");

const PLACEHOLDER_RE = /\$\$PLACEHOLDER_\d+\$\$/i;

const COLOR_TO_PALETTE = [
  { re: /\bblack\b/i, tag: "Black", hex: "#161616" },
  { re: /\bnavy\b/i, tag: "Navy", hex: "#1f2a44" },
  { re: /\b(grey|gray|charcoal)\b/i, tag: "Grey / Charcoal", hex: "#4a4a48" },
  { re: /\b(ivory|cream|off[\s-]?white|white)\b/i, tag: "Ivory / Cream", hex: "#F5F2E9" },
  { re: /\b(camel|tan|cognac|brown|chocolate)\b/i, tag: "Camel / Tan", hex: "#6b3f22" },
  { re: /\bolive\b/i, tag: "Olive", hex: "#3E4228" },
  { re: /\b(forest|dark green)\b/i, tag: "Forest Green", hex: "#2f3d2e" },
  { re: /\b(burgundy|wine|oxblood)\b/i, tag: "Burgundy", hex: "#5c1f2e" },
  { re: /\b(beige|sand|khaki|stone)\b/i, tag: "Sand / Beige", hex: "#cbb994" },
  { re: /\b(rust|terracotta|orange)\b/i, tag: "Rust / Terracotta", hex: "#8B5A2B" },
];

/** Hard exclude — baby / kids / women-only noise common in big mixed feeds */
const EXCLUDE_RE = /\b(baby|babies|infant|toddler|newborn|maternity|nursing|women|womens|woman'?s|ladies|female|girls?|kids?|children|child|nursery|onesie|romper|stroller|diaper)\b/i;

/** Positive menswear garment signal */
const GARMENT_RE = /\b(suit|suits|blazer|sport\s*coat|jacket|shirts?|dress\s*shirt|oxford|polo|hoodie|sweater|knit|turtleneck|trouser|trousers|pants?|chino|jeans?|shoe|shoes|boot|boots|sneaker|sneakers|loafer|derby|outerwear|coat|overcoat|parka|athletic|activewear|gym|trainer|trainers|shorts?|gilet|waistcoat|vest)\b/i;

/** Name-first family rules — most specific first. Avoid category-path poisoning. */
const FAMILY_RULES = [
  { family: "sunglasses", type: "accessory", re: /\b(sunglass|eyeglasses?|eyewear)\b/i },
  { family: "scarf", type: "accessory", re: /\b(scarf|pocket\s*square)\b/i },
  { family: "belt", type: "accessory", re: /\b(belt)\b/i },
  // Footwear BEFORE trousers — "dress shoe" / "short boots" must not become pants
  { family: "shoe", type: "shoe", re: /\b(dress\s*shoes?|shoes?|boots?|sneakers?|loafer|derby|trainers?|footwear|oxfords?|wingtip|brogue|monk)\b/i },
  { family: "trouser", type: "trouser", re: /\b(joggers?|sweatpants?|track\s*pants?|gym\s*shorts?|athletic\s*shorts?)\b/i },
  { family: "trouser", type: "trouser", re: /\b(trousers?|chinos?|jeans?|pants?|cargos?)\b/i },
  { family: "shirt", type: "shirt", re: /\b(hoodie|sweatshirt|t-?shirts?|tees?\b|polo|turtleneck|jumper|sweater|knit|henley|dress\s*shirts?|shirts?)\b/i },
  { family: "blazer", type: "blazer", re: /\b(tuxedo|tux|suit|blazer|sport\s*coat|suit\s*jacket|dinner\s*jacket)\b/i },
  { family: "blazer", type: "blazer", re: /\b(overcoat|peacoat|topcoat|parka|gilet|waistcoat|outerwear|jacket|coat)\b/i },
  { family: "trouser", type: "trouser", re: /\bshorts\b/i },
];

const DEFAULT_CAPS = {
  blazer: 700,
  shirt: 900,
  trouser: 750,
  shoe: 800,
  belt: 220,
  scarf: 140,
  sunglasses: 140,
};

function cell(row, ...keys) {
  for (const k of keys) {
    const v = row[k] ?? row[String(k).toLowerCase()];
    if (v != null && String(v).trim()) return String(v).trim();
  }
  return "";
}

function parsePrice(raw) {
  const s = String(raw || "").trim();
  if (!s || PLACEHOLDER_RE.test(s)) return null;
  const n = Number(s.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function mapColors(text) {
  const tags = [];
  let hex = "#4a4a48";
  for (const row of COLOR_TO_PALETTE) {
    if (row.re.test(text)) {
      tags.push(row.tag);
      if (tags.length === 1) hex = row.hex;
    }
  }
  if (!tags.length) tags.push("Grey / Charcoal");
  return { paletteTags: [...new Set(tags)].slice(0, 3), color: hex };
}

function inferFamily(blob, nameFirst = "") {
  // Prefer product name so merchant category paths cannot force jeans → shoe
  const name = String(nameFirst || "");
  if (name) {
    for (const rule of FAMILY_RULES) {
      if (!rule.re.test(name)) continue;
      if (rule.family === "trouser" && /\bshort\s*sleeve\b/i.test(name) && !/\bshorts\b/i.test(name)) continue;
      if (rule.family === "trouser" && /\bshort\b/i.test(name) && /\b(suit|blazer|coat)\b/i.test(name) && !/\bshorts\b/i.test(name)) continue;
      return { family: rule.family, type: rule.type };
    }
  }
  for (const rule of FAMILY_RULES) {
    if (rule.re.test(blob)) return { family: rule.family, type: rule.type };
  }
  return null;
}

function fashionCell(row, suffix) {
  // Create-a-Feed headers arrive as "Fashion:suitable_for" → normalized variously
  return cell(
    row,
    `fashion:${suffix}`,
    `fashion_${suffix}`,
    `fashion%3a${suffix}`,
    suffix,
  );
}

function isMenswearRow(row) {
  const suitable = fashionCell(row, "suitable_for");
  const fashionCat = fashionCell(row, "category");
  const blob = [
    suitable,
    fashionCat,
    cell(row, "gender"),
    cell(row, "category_name", "category", "merchant_category", "product_type", "fashion_product_type"),
    cell(row, "merchant_product_category_path", "merchant_product_second_category", "merchant_product_third_category"),
    cell(row, "product_name", "name", "title"),
    cell(row, "description", "description_short", "product_short_description"),
    cell(row, "keywords"),
    cell(row, "custom_1", "custom_2", "custom_3"),
  ].join(" ");

  // Fashion:suitable_for is the strongest signal in this Create-a-Feed
  if (suitable) {
    const s = suitable.toLowerCase();
    if (/\b(women|womens|woman|ladies|female|girl|kids?|children|baby|infant)\b/.test(s) && !/\b(men|mens|man|male|unisex)\b/.test(s)) {
      return false;
    }
    if (/\b(men|mens|man|male|unisex|him)\b/.test(s)) {
      return Boolean(inferFamily(`${fashionCat} ${blob}`) || GARMENT_RE.test(blob));
    }
  }

  if (EXCLUDE_RE.test(blob) && !/\b(men|mens|man's|male|unisex)\b/i.test(blob)) {
    return false;
  }
  // Explicit women without men → drop
  if (/\b(women|womens|woman|ladies|female)\b/i.test(blob) && !/\b(men|mens|man's|male|unisex)\b/i.test(blob)) {
    return false;
  }
  if (!GARMENT_RE.test(blob) && !/\b(men|mens|man's|male)\b/i.test(blob)) {
    return false;
  }
  return Boolean(inferFamily(blob));
}

function normalizeRow(row) {
  const name = cell(row, "product_name", "name", "title");
  const shopUrl = cell(row, "aw_deep_link", "deep_link", "merchant_deep_link", "aw_product_url", "product_url", "basket_link");
  if (!name || !shopUrl) return null;
  if (PLACEHOLDER_RE.test(shopUrl) || PLACEHOLDER_RE.test(name)) return null;

  const stock = cell(row, "in_stock", "stock_status", "availability", "size_stock_status").toLowerCase();
  if (stock && /out\s*of\s*stock|unavailable|false|0\b|no\b/.test(stock) && !/in\s*stock|true|yes|1\b/.test(stock)) {
    return null;
  }

  if (!isMenswearRow(row)) return null;

  const blob = [
    name,
    fashionCell(row, "category"),
    cell(row, "category_name", "category", "merchant_category", "merchant_product_category_path"),
    cell(row, "product_type", "fashion_product_type"),
    cell(row, "description", "product_short_description"),
    fashionCell(row, "suitable_for"),
    cell(row, "gender"),
  ].join(" ");
  if (/\b(sock|socks|glove|gloves)\b/i.test(name)) return null;
  const meta = inferFamily(blob, name);
  if (!meta) return null;

  const price = parsePrice(cell(row, "search_price", "store_price", "price", "display_price", "rrp_price", "base_price"));
  // Keep items with placeholder/missing price — shop link still works; UI can hide $0
  const colourText = `${cell(row, "colour", "color", "colour_name")} ${name}`;
  const { paletteTags, color } = mapColors(colourText);
  const id = cell(row, "aw_product_id", "product_id", "merchant_product_id", "id")
    || `${meta.family}-${Buffer.from(name).toString("base64url").slice(0, 16)}`;
  const image = cell(row, "aw_image_url", "merchant_image_url", "image_url", "large_image", "aw_thumb_url", "merchant_thumb_url");

  return {
    key: `aw-${id}`,
    id: String(id),
    name,
    price: price == null ? 0 : price,
    priceMissing: price == null,
    retailer: cell(row, "merchant_name", "advertiser_name", "store") || "Retailer",
    brand: cell(row, "brand_name", "brand") || null,
    type: meta.type,
    family: meta.family,
    color,
    paletteTags,
    image: image && !PLACEHOLDER_RE.test(image) ? image : null,
    searchQuery: name,
    searchNoun: name,
    shopUrl,
    clickUrl: shopUrl,
    inStock: true,
    source: "awin",
    merchantId: cell(row, "merchant_id", "advertiser_id") || null,
    category: cell(row, "category_name", "category", "merchant_category") || fashionCell(row, "category") || null,
  };
}

/** Parse one CSV line into fields (handles quotes; assumes no embedded newlines). */
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
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
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
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === delimiter) {
      out.push(field);
      field = "";
      continue;
    }
    field += ch;
  }
  out.push(field);
  return out;
}

/**
 * Wrap a web/node readable so we can detect gzip and decompress without
 * buffering the whole body.
 *
 * Note: undici/fetch auto-decompresses Content-Encoding: gzip|deflate.
 * In that case the body is already plain CSV — do NOT gunzip again.
 */
function maybeGunzipStream(nodeIn, feedUrl, resHeaders) {
  const urlLower = String(feedUrl).toLowerCase();
  const contentEncoding = String(resHeaders.get("content-encoding") || "").toLowerCase();
  const contentType = String(resHeaders.get("content-type") || "").toLowerCase();
  const likelyZip = /compression\/zip/.test(urlLower) || /\bzip\b/.test(contentType);

  if (likelyZip && !/gzip/.test(urlLower) && !/gzip/.test(contentEncoding)) {
    const err = new Error(
      "AWIN_FEED_URL uses zip compression. In Create-a-Feed, pick format CSV + compression gzip, then paste that URL."
    );
    err.status = 400;
    throw err;
  }

  // Fetch already decoded Content-Encoding — stream is plain text/CSV
  if (/gzip|deflate|br/.test(contentEncoding)) {
    return nodeIn;
  }

  // Raw gzip body (common for Awin download URLs that omit Content-Encoding)
  if (/compression\/gzip/.test(urlLower) || /gzip/.test(contentType)) {
    return nodeIn.pipe(zlib.createGunzip());
  }

  return nodeIn;
}

/**
 * Stream-fetch Awin feed URL (gzip or plain CSV), filter menswear, cap per family.
 * Never buffers the full ~900MB body as a string.
 */
async function streamMenswearFromFeedUrl(feedUrl, {
  caps = DEFAULT_CAPS,
  maxTotal = 4000,
  onProgress = null,
} = {}) {
  const res = await fetch(feedUrl, {
    headers: { Accept: "application/gzip, text/csv, */*" },
    redirect: "follow",
  });
  if (!res.ok) {
    const err = new Error(`Awin feed HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  if (!res.body) {
    throw new Error("Awin feed response has no body stream");
  }

  const nodeIn = Readable.fromWeb(res.body);
  const stream = maybeGunzipStream(nodeIn, feedUrl, res.headers);
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  let headers = null;
  let delimiter = ",";
  let scanned = 0;
  let kept = 0;
  let skippedPlaceholderPrice = 0;
  const byFamily = Object.fromEntries(Object.keys(caps).map((k) => [k, []]));
  const familySeen = Object.fromEntries(Object.keys(caps).map((k) => [k, 0]));
  const seen = new Set();

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
            .replace(/%3a/gi, "_")
        );
        continue;
      }
      scanned += 1;
      if (scanned % 25000 === 0 && typeof onProgress === "function") {
        onProgress({ scanned, kept: Object.values(byFamily).reduce((n, a) => n + a.length, 0) });
      }

      const cols = splitLine(line, delimiter);
      const row = {};
      headers.forEach((h, i) => {
        row[h] = cols[i] != null ? String(cols[i]).trim() : "";
      });

      const rawPrice = cell(row, "search_price", "store_price", "price", "display_price");
      if (PLACEHOLDER_RE.test(rawPrice)) skippedPlaceholderPrice += 1;

      const item = normalizeRow(row);
      if (!item) continue;
      if (seen.has(item.id)) continue;
      const bucket = byFamily[item.family];
      if (!bucket) continue;
      const cap = caps[item.family] || 0;
      familySeen[item.family] = (familySeen[item.family] || 0) + 1;
      const seenForFam = familySeen[item.family];

      // Reservoir sample so late merchants aren't crowded out by the first 25k rows
      if (bucket.length < cap) {
        seen.add(item.id);
        bucket.push(item);
      } else {
        const j = Math.floor(Math.random() * seenForFam);
        if (j < cap) {
          const prev = bucket[j];
          if (prev?.id) seen.delete(prev.id);
          seen.add(item.id);
          bucket[j] = item;
        }
      }

      const total = Object.values(byFamily).reduce((n, a) => n + a.length, 0);
      // Never early-exit — we want reservoir coverage across the full feed.
      // Soft stop only if somehow over maxTotal (shouldn't happen with caps).
      if (total > maxTotal + 50) break;
    }
  } finally {
    rl.close();
    try {
      stream.destroy?.();
    } catch {
      /* ignore */
    }
  }

  const items = Object.values(byFamily).flat();
  return {
    items,
    meta: {
      scanned,
      kept: items.length,
      skippedPlaceholderPrice,
      byFamily: Object.fromEntries(Object.entries(byFamily).map(([k, v]) => [k, v.length])),
      fetchedAt: new Date().toISOString(),
      feedHost: (() => {
        try {
          return new URL(feedUrl).host;
        } catch {
          return null;
        }
      })(),
    },
  };
}

async function getBlobStore(event = null) {
  try {
    const { getStore, connectLambda } = require("@netlify/blobs");
    // Classic Netlify Functions must wire Blobs credentials from the Lambda event
    if (event?.blobs) {
      connectLambda(event);
    }
    return getStore({ name: CACHE_STORE, consistency: "strong" });
  } catch (err) {
    console.error("getBlobStore failed", err?.message || err);
    return null;
  }
}

async function writeMenswearCache(payload, event = null) {
  const body = {
    version: 1,
    source: "awin",
    ...payload,
  };
  const store = await getBlobStore(event);
  if (store) {
    await store.setJSON(CACHE_KEY, body);
    return { via: "blobs", key: CACHE_KEY };
  }
  if (process.env.NETLIFY) {
    throw new Error("Netlify Blobs unavailable — cannot persist menswear cache on NETLIFY");
  }
  fs.writeFileSync(LOCAL_CACHE_PATH, JSON.stringify(body));
  return { via: "tmp", path: LOCAL_CACHE_PATH };
}

async function readMenswearCache(event = null) {
  const store = await getBlobStore(event);
  if (store) {
    try {
      const data = await store.get(CACHE_KEY, { type: "json" });
      if (data?.items?.length) return data;
    } catch (err) {
      console.error("readMenswearCache blobs failed", err?.message || err);
    }
  }
  try {
    if (fs.existsSync(LOCAL_CACHE_PATH)) {
      const data = JSON.parse(fs.readFileSync(LOCAL_CACHE_PATH, "utf8"));
      if (data?.items?.length) return data;
    }
  } catch {
    /* empty */
  }
  return null;
}

async function writeSyncStatus(payload, event = null) {
  const body = { version: 1, updatedAt: new Date().toISOString(), ...payload };
  const store = await getBlobStore(event);
  if (store) {
    await store.setJSON(SYNC_STATUS_KEY, body);
    return { via: "blobs" };
  }
  if (process.env.NETLIFY) {
    throw new Error("Netlify Blobs unavailable — cannot persist sync status on NETLIFY");
  }
  fs.writeFileSync(LOCAL_SYNC_PATH, JSON.stringify(body));
  return { via: "tmp" };
}

async function readSyncStatus(event = null) {
  const store = await getBlobStore(event);
  if (store) {
    try {
      const data = await store.get(SYNC_STATUS_KEY, { type: "json" });
      if (data) return data;
    } catch (err) {
      console.error("readSyncStatus blobs failed", err?.message || err);
    }
  }
  try {
    if (fs.existsSync(LOCAL_SYNC_PATH)) {
      return JSON.parse(fs.readFileSync(LOCAL_SYNC_PATH, "utf8"));
    }
  } catch {
    /* empty */
  }
  return null;
}

function resolveFeedUrl() {
  return String(process.env.AWIN_FEED_URL || "").trim();
}

module.exports = {
  CACHE_STORE,
  CACHE_KEY,
  SYNC_STATUS_KEY,
  DEFAULT_CAPS,
  PLACEHOLDER_RE,
  streamMenswearFromFeedUrl,
  writeMenswearCache,
  readMenswearCache,
  writeSyncStatus,
  readSyncStatus,
  resolveFeedUrl,
  normalizeRow,
  isMenswearRow,
  parsePrice,
  splitCsvLine,
};
