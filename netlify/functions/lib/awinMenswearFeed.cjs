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
const LOCAL_CACHE_PATH = path.join("/tmp", "vestra-awin-menswear-v1.json");

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

const FAMILY_RULES = [
  { family: "sunglasses", type: "accessory", re: /\b(sunglass|eyewear)\b/i },
  { family: "scarf", type: "accessory", re: /\b(scarf|pocket\s*square)\b/i },
  { family: "belt", type: "accessory", re: /\b(belt)\b/i },
  // Shirts before shoes — "oxford shirt" must not become footwear
  { family: "shirt", type: "shirt", re: /\b(shirt|tee|t-shirt|polo|hoodie|sweater|knit|turtleneck|jumper|activewear|gym|athletic)\b/i },
  { family: "trouser", type: "trouser", re: /\b(trouser|pant|chino|jean|short|cargo)\b/i },
  { family: "blazer", type: "blazer", re: /\b(suit|blazer|sport\s*coat|suit\s*jacket)\b/i },
  { family: "blazer", type: "blazer", re: /\b(coat|jacket|outerwear|parka|overcoat|gilet)\b/i },
  { family: "shoe", type: "shoe", re: /\b(shoes?|boots?|sneakers?|loafer|derby|trainers?|footwear|oxford\s+shoes?)\b/i },
];

const DEFAULT_CAPS = {
  blazer: 500,
  shirt: 700,
  trouser: 600,
  shoe: 500,
  belt: 120,
  scarf: 80,
  sunglasses: 80,
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

function inferFamily(blob) {
  for (const rule of FAMILY_RULES) {
    if (rule.re.test(blob)) return { family: rule.family, type: rule.type };
  }
  return null;
}

function isMenswearRow(row) {
  const blob = [
    cell(row, "gender"),
    cell(row, "category_name", "category", "merchant_category", "product_type", "fashion_product_type"),
    cell(row, "product_name", "name", "title"),
    cell(row, "description", "description_short"),
    cell(row, "custom_1", "custom_2", "custom_3"),
  ].join(" ");

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
  const shopUrl = cell(row, "aw_deep_link", "deep_link", "merchant_deep_link", "aw_product_url", "product_url");
  if (!name || !shopUrl) return null;
  if (PLACEHOLDER_RE.test(shopUrl) || PLACEHOLDER_RE.test(name)) return null;

  const stock = cell(row, "in_stock", "stock_status", "availability").toLowerCase();
  if (stock && /out\s*of\s*stock|unavailable|false|0\b|no\b/.test(stock) && !/in\s*stock|true|yes|1\b/.test(stock)) {
    return null;
  }

  if (!isMenswearRow(row)) return null;

  const blob = [
    cell(row, "category_name", "category", "merchant_category"),
    name,
    cell(row, "product_type", "fashion_product_type"),
    cell(row, "description"),
    cell(row, "gender"),
  ].join(" ");
  const meta = inferFamily(blob);
  if (!meta) return null;

  const price = parsePrice(cell(row, "search_price", "store_price", "price", "display_price", "rrp_price"));
  // Keep items with placeholder/missing price — shop link still works; UI can hide $0
  const colourText = `${cell(row, "colour", "color", "colour_name")} ${name}`;
  const { paletteTags, color } = mapColors(colourText);
  const id = cell(row, "aw_product_id", "product_id", "merchant_product_id", "id")
    || `${meta.family}-${Buffer.from(name).toString("base64url").slice(0, 16)}`;
  const image = cell(row, "aw_image_url", "merchant_image_url", "image_url", "large_image", "aw_thumb_url");

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
    category: cell(row, "category_name", "category") || null,
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
  const seen = new Set();

  try {
    for await (const line of rl) {
      if (!line || !String(line).trim()) continue;
      if (!headers) {
        const headerLine = String(line).replace(/^\uFEFF/, "");
        delimiter = detectDelimiter(headerLine);
        headers = splitLine(headerLine, delimiter).map((h) =>
          String(h || "").trim().toLowerCase().replace(/\s+/g, "_")
        );
        continue;
      }
      scanned += 1;
      if (scanned % 25000 === 0 && typeof onProgress === "function") {
        onProgress({ scanned, kept });
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
      if (bucket.length >= (caps[item.family] || 0)) continue;
      seen.add(item.id);
      bucket.push(item);
      kept += 1;
      if (kept >= maxTotal) break;
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

async function getBlobStore() {
  try {
    const { getStore } = require("@netlify/blobs");
    return getStore({ name: CACHE_STORE, consistency: "strong" });
  } catch {
    return null;
  }
}

async function writeMenswearCache(payload) {
  const body = {
    version: 1,
    source: "awin",
    ...payload,
  };
  const store = await getBlobStore();
  if (store) {
    await store.setJSON(CACHE_KEY, body);
    return { via: "blobs", key: CACHE_KEY };
  }
  fs.writeFileSync(LOCAL_CACHE_PATH, JSON.stringify(body));
  return { via: "tmp", path: LOCAL_CACHE_PATH };
}

async function readMenswearCache() {
  const store = await getBlobStore();
  if (store) {
    try {
      const data = await store.get(CACHE_KEY, { type: "json" });
      if (data?.items?.length) return data;
    } catch {
      /* fall through */
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

function resolveFeedUrl() {
  return String(process.env.AWIN_FEED_URL || "").trim();
}

module.exports = {
  CACHE_STORE,
  CACHE_KEY,
  DEFAULT_CAPS,
  PLACEHOLDER_RE,
  streamMenswearFromFeedUrl,
  writeMenswearCache,
  readMenswearCache,
  resolveFeedUrl,
  normalizeRow,
  isMenswearRow,
  parsePrice,
  splitCsvLine,
};
