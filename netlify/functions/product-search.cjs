/**
 * product-search — server-side Awin product data feed proxy.
 *
 * Env (Netlify — never expose to the client):
 *   AWIN_PRODUCT_API_KEY  — Product Feed API key from Toolbox → Create-a-Feed
 *                           (NOT the same as the Publisher API Bearer token)
 *   AWIN_MERCHANT_IDS     — optional comma-separated advertiser/merchant IDs
 *                           once brands are approved (e.g. "1234,5678")
 *   AWIN_FEED_URL         — optional full Create-a-Feed download URL
 *                           (overrides mid-based download when set)
 *   AWIN_MAX_MERCHANTS    — optional cap on merchants to pull (default 6)
 *   AWIN_MAX_PRODUCTS     — optional cap on products returned (default 500)
 *
 * Returns Vestra-shaped men's products, or { source: "backup", items: [] }
 * when the key/feed is missing or unavailable so the client keeps working.
 */
const zlib = require("zlib");
const { promisify } = require("util");
const gunzip = promisify(zlib.gunzip);
const inflateRaw = promisify(zlib.inflateRaw);

const FEED_LIST_BASE = "https://productdata.awin.com/datafeed/list/apikey";
const FEED_DOWNLOAD_BASE = "https://productdata.awin.com/datafeed/download";

/** Columns we ask Awin for (Legacy feed). aw_deep_link is the affiliate URL. */
const FEED_COLUMNS = [
  "aw_deep_link",
  "product_name",
  "aw_product_id",
  "merchant_product_id",
  "merchant_name",
  "merchant_id",
  "brand_name",
  "brand_id",
  "category_name",
  "category_id",
  "aw_image_url",
  "merchant_image_url",
  "description",
  "search_price",
  "store_price",
  "currency",
  "colour",
  "color",
  "in_stock",
  "stock_status",
  "product_type",
  "fashion_product_type",
  "size",
  "gender",
].join(",");

const FASHION_NAME_HINT = /\b(fashion|apparel|clothing|menswear|men'?s|clothes|shoe|footwear|sport|active|gym|nike|adidas|zara|h&m|asos|nordstrom|gap|uniqlo|j\.?\s*crew|banana republic|lululemon|under armour|reebok|puma|new balance|everlane|bonobos|suitsupply|ted baker|ralph lauren|tommy|hugo boss|calvin klein|levi|dockers|express|anthropologie|urban outfitters|revolve|mr\s*porter|matches|selfridges|john lewis|next|marks\s*&\s*spencer|m&s)\b/i;

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

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Content-Type": "application/json",
  };
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  const src = String(text || "").replace(/^\uFEFF/, "");
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    const next = src[i + 1];
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
      row.push(field);
      field = "";
      continue;
    }
    if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }
    if (ch === "\r") continue;
    field += ch;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  if (!rows.length) return [];
  const headers = rows[0].map((h) => String(h || "").trim().toLowerCase().replace(/\s+/g, "_"));
  return rows.slice(1).filter((r) => r.some((c) => String(c || "").trim())).map((r) => {
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = r[idx] != null ? String(r[idx]).trim() : "";
    });
    return obj;
  });
}

async function decompressBody(buf) {
  // Try gzip, then raw deflate (zip member), then plain text
  try {
    return (await gunzip(buf)).toString("utf8");
  } catch {
    /* continue */
  }
  try {
    return (await inflateRaw(buf)).toString("utf8");
  } catch {
    /* continue */
  }
  return buf.toString("utf8");
}

async function fetchText(url, { timeoutMs = 12000 } = {}) {
  const res = await fetch(url, {
    headers: { Accept: "application/gzip, application/zip, text/csv, */*" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    const err = new Error(`Awin HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  return decompressBody(buf);
}

function cell(row, ...keys) {
  for (const k of keys) {
    const v = row[k] ?? row[String(k).toLowerCase()];
    if (v != null && String(v).trim()) return String(v).trim();
  }
  return "";
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
  const t = String(blob || "").toLowerCase();
  if (/\b(sunglass|eyewear)\b/.test(t)) return { family: "sunglasses", type: "accessory" };
  if (/\b(scarf|pocket\s*square)\b/.test(t)) return { family: "scarf", type: "accessory" };
  if (/\b(belt)\b/.test(t)) return { family: "belt", type: "accessory" };
  if (/\b(shoe|boot|sneaker|loafer|oxford|derby|trainer|footwear)\b/.test(t)) {
    return { family: "shoe", type: "shoe" };
  }
  if (/\b(trouser|pant|chino|jean|short|cargo)\b/.test(t)) return { family: "trouser", type: "trouser" };
  if (/\b(blazer|sport\s*coat|suit\s*jacket)\b/.test(t)) return { family: "blazer", type: "blazer" };
  if (/\b(coat|jacket|outerwear|parka|overcoat)\b/.test(t)) return { family: "blazer", type: "blazer" };
  if (/\b(shirt|tee|t-shirt|polo|hoodie|sweater|knit|turtleneck|jumper|top|activewear|gym)\b/.test(t)) {
    return { family: "shirt", type: "shirt" };
  }
  return null;
}

function looksMens(row) {
  const blob = [
    cell(row, "gender"),
    cell(row, "category_name", "category"),
    cell(row, "product_name", "name", "title"),
    cell(row, "description"),
    cell(row, "product_type", "fashion_product_type"),
  ].join(" ").toLowerCase();

  const womenOnly = /\b(women|womens|woman|ladies|female|girls?)\b/.test(blob)
    && !/\b(men|mens|man's|male|boys?|unisex)\b/.test(blob);
  if (womenOnly) return false;

  // Prefer explicit men / unisex; otherwise allow if garment family is clear
  if (/\b(men|mens|man's|male|boys?|unisex)\b/.test(blob)) return true;
  return Boolean(inferFamily(blob));
}

function normalizeProduct(row) {
  const name = cell(row, "product_name", "name", "title");
  const shopUrl = cell(row, "aw_deep_link", "deep_link", "merchant_deep_link", "aw_product_url");
  if (!name || !shopUrl) return null;

  const stock = cell(row, "in_stock", "stock_status", "availability").toLowerCase();
  if (stock && /out\s*of\s*stock|unavailable|false|0|no/.test(stock) && !/in\s*stock|true|yes|1/.test(stock)) {
    return null;
  }

  const blob = [
    cell(row, "category_name", "category"),
    name,
    cell(row, "product_type", "fashion_product_type"),
    cell(row, "description"),
    cell(row, "gender"),
  ].join(" ");
  if (!looksMens(row)) return null;

  const meta = inferFamily(blob);
  if (!meta) return null;

  const colourText = `${cell(row, "colour", "color", "colour_name")} ${name}`;
  const { paletteTags, color } = mapColors(colourText);
  const priceRaw = cell(row, "search_price", "store_price", "price", "display_price");
  const price = Number(String(priceRaw).replace(/[^0-9.]/g, "")) || 0;
  const id = cell(row, "aw_product_id", "product_id", "merchant_product_id", "id") || `${meta.family}-${name.slice(0, 24)}`;
  const image = cell(row, "aw_image_url", "merchant_image_url", "image_url", "large_image", "aw_thumb_url");
  const retailer = cell(row, "merchant_name", "advertiser_name", "store") || "Retailer";
  const brand = cell(row, "brand_name", "brand") || null;

  return {
    key: `aw-${id}`,
    id: String(id),
    name,
    price,
    retailer,
    brand,
    type: meta.type,
    family: meta.family,
    color,
    paletteTags,
    image: image || null,
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

function pickMerchantIdsFromList(listRows, { explicitIds, maxMerchants }) {
  if (explicitIds.length) return explicitIds.slice(0, maxMerchants);

  const scored = [];
  for (const row of listRows) {
    const mid = cell(row, "advertiser_id", "merchant_id", "programme_id", "advertiserid");
    const name = cell(row, "advertiser_name", "merchant_name", "programme_name", "advertiser");
    const vertical = cell(row, "vertical", "primary_region", "feed_name", "language");
    const status = cell(row, "membership_status", "relationship", "status").toLowerCase();
    if (!mid) continue;
    if (status && /reject|suspend|not\s*joined|left/.test(status) && !/joined|active|approved/.test(status)) {
      continue;
    }
    let score = 0;
    if (FASHION_NAME_HINT.test(`${name} ${vertical}`)) score += 10;
    if (/\bmen|menswear|apparel|fashion|clothing\b/i.test(`${name} ${vertical}`)) score += 5;
    if (/joined|active|approved/.test(status)) score += 3;
    if (score > 0) scored.push({ mid, score, name });
  }
  scored.sort((a, b) => b.score - a.score);
  const unique = [];
  const seen = new Set();
  for (const row of scored) {
    if (seen.has(row.mid)) continue;
    seen.add(row.mid);
    unique.push(row.mid);
    if (unique.length >= maxMerchants) break;
  }
  return unique;
}

function buildDownloadUrl(apiKey, merchantIds) {
  const mids = merchantIds.join(",");
  return `${FEED_DOWNLOAD_BASE}/apikey/${encodeURIComponent(apiKey)}/mid/${mids}/format/csv/compression/gzip/columns/${FEED_COLUMNS}/content/clean`;
}

async function loadProductsFromAwin({ apiKey, feedUrl, merchantIds, maxMerchants, maxProducts }) {
  let mids = merchantIds;
  let listCount = 0;

  if (!feedUrl) {
    const listText = await fetchText(`${FEED_LIST_BASE}/${encodeURIComponent(apiKey)}`, { timeoutMs: 15000 });
    // HTML error pages
    if (listText.trimStart().startsWith("<")) {
      const err = new Error("Awin feed list returned HTML (bad key or blocked)");
      err.status = 401;
      throw err;
    }
    const listRows = parseCsv(listText);
    listCount = listRows.length;
    mids = pickMerchantIdsFromList(listRows, { explicitIds: merchantIds, maxMerchants });
    if (!mids.length) {
      return { items: [], reason: "no_merchants", listCount };
    }
  }

  const url = feedUrl || buildDownloadUrl(apiKey, mids);
  const csvText = await fetchText(url, { timeoutMs: 20000 });
  if (csvText.trimStart().startsWith("<")) {
    const err = new Error("Awin product feed returned HTML");
    err.status = 502;
    throw err;
  }
  const rows = parseCsv(csvText);
  const items = [];
  const seen = new Set();
  for (const row of rows) {
    const item = normalizeProduct(row);
    if (!item) continue;
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    items.push(item);
    if (items.length >= maxProducts) break;
  }
  return { items, reason: items.length ? null : "empty_feed", listCount, merchants: mids };
}

exports.handler = async (event) => {
  const headers = corsHeaders();
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }
  if (event.httpMethod !== "POST" && event.httpMethod !== "GET") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  let body = {};
  if (event.httpMethod === "POST" && event.body) {
    try {
      body = JSON.parse(event.body);
    } catch {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid JSON" }) };
    }
  }

  const apiKey = process.env.AWIN_PRODUCT_API_KEY || process.env.AWIN_API_KEY || "";
  const feedUrl = (process.env.AWIN_FEED_URL || body.feedUrl || "").trim();
  const merchantIds = String(process.env.AWIN_MERCHANT_IDS || body.merchantIds || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const maxMerchants = Math.min(Math.max(Number(process.env.AWIN_MAX_MERCHANTS || body.maxMerchants || 6), 1), 20);
  const maxProducts = Math.min(Math.max(Number(process.env.AWIN_MAX_PRODUCTS || body.maxProducts || 500), 20), 1200);

  if (!apiKey && !feedUrl) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        source: "backup",
        reason: "missing_api_key",
        items: [],
        message: "Set AWIN_PRODUCT_API_KEY (and ideally AWIN_MERCHANT_IDS) in Netlify env. Client will use backup catalog.",
      }),
    };
  }

  try {
    const result = await loadProductsFromAwin({
      apiKey,
      feedUrl,
      merchantIds,
      maxMerchants,
      maxProducts,
    });

    if (!result.items.length) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          source: "backup",
          reason: result.reason || "empty_feed",
          items: [],
          listCount: result.listCount || 0,
          merchants: result.merchants || merchantIds,
        }),
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        source: "awin",
        reason: null,
        count: result.items.length,
        listCount: result.listCount || 0,
        merchants: result.merchants || merchantIds,
        items: result.items,
      }),
    };
  } catch (err) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        source: "backup",
        reason: "api_error",
        items: [],
        message: err?.message || "Awin request failed",
      }),
    };
  }
};
