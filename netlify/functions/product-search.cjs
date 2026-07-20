/**
 * product-search — server-side ShopStyle Collective product feed proxy.
 *
 * Env: SHOPSTYLE_API_KEY (never expose to the client)
 *
 * Returns Vestra-shaped men's products, or { source: "backup", items: [] }
 * when the key is missing / API is down so the client can use BACKUP_CATALOG.
 *
 * NOTE (2026): Collective Voice (ShopStyle Collective) has shut down.
 * This function still speaks the historical ShopStyle v2 product API so a
 * surviving key or a drop-in compatible proxy can work. Without a live feed
 * the client falls back to the hardcoded backup catalog.
 */
const SHOPSTYLE_BASE = "https://api.shopstyle.com/api/v2/products";

/** Men's categories → Vestra garment family */
const MENS_CATEGORIES = [
  { cat: "mens-blazers", family: "blazer", type: "blazer", fts: "men blazer sport coat" },
  { cat: "mens-shirts", family: "shirt", type: "shirt", fts: "men dress shirt" },
  { cat: "mens-sweaters", family: "shirt", type: "shirt", fts: "men turtleneck sweater" },
  { cat: "mens-pants", family: "trouser", type: "trouser", fts: "men dress trousers pants" },
  { cat: "mens-jeans", family: "trouser", type: "trouser", fts: "men jeans" },
  { cat: "mens-shoes", family: "shoe", type: "shoe", fts: "men dress shoes derby" },
  { cat: "mens-boots", family: "shoe", type: "shoe", fts: "men chelsea boots" },
  { cat: "mens-sneakers", family: "shoe", type: "shoe", fts: "men sneakers" },
  { cat: "mens-outerwear", family: "blazer", type: "blazer", fts: "men coat jacket outerwear" },
  { cat: "mens-activewear", family: "shirt", type: "shirt", fts: "men athletic gym hoodie" },
  { cat: "mens-belts", family: "belt", type: "accessory", fts: "men leather belt" },
  { cat: "mens-scarves", family: "scarf", type: "accessory", fts: "men wool scarf" },
  { cat: "mens-sunglasses", family: "sunglasses", type: "accessory", fts: "men sunglasses" },
];

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

function mapColors(product) {
  const blobs = [];
  if (Array.isArray(product.colors)) {
    for (const c of product.colors) {
      if (c?.name) blobs.push(c.name);
      if (c?.canonicalName) blobs.push(c.canonicalName);
    }
  }
  blobs.push(product.name || "");
  const text = blobs.join(" ");
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

function pickImage(product) {
  const img = product.image || product.images?.[0] || {};
  return (
    img.sizes?.Original?.url
    || img.sizes?.Large?.url
    || img.sizes?.Best?.url
    || img.sizes?.Medium?.url
    || img.url
    || null
  );
}

function normalizeProduct(product, meta) {
  if (!product?.id) return null;
  // Prefer in-stock when the field exists
  if (product.inStock === false) return null;
  const { paletteTags, color } = mapColors(product);
  const name = String(product.name || "").trim();
  if (!name) return null;
  const retailer =
    product.retailer?.name
    || product.retailerName
    || product.brand?.name
    || product.brandName
    || "Retailer";
  const brand = product.brand?.name || product.brandName || null;
  const price = Number(product.salePrice || product.price || 0);
  const shopUrl = product.clickUrl || product.pageUrl || null;
  if (!shopUrl) return null; // must be monetizable / real link
  const image = pickImage(product);
  const key = `ss-${product.id}`;
  return {
    key,
    id: String(product.id),
    name,
    price,
    retailer,
    brand,
    type: meta.type,
    family: meta.family,
    color,
    paletteTags,
    image,
    searchQuery: name,
    searchNoun: name,
    shopUrl,
    clickUrl: shopUrl,
    inStock: product.inStock !== false,
    source: "shopstyle",
    category: meta.cat,
  };
}

async function fetchCategory(pid, meta, limit) {
  const params = new URLSearchParams({
    pid,
    format: "json",
    limit: String(limit),
    offset: "0",
    sort: "Popular",
  });
  // Prefer category id when available; always include mens free-text as safety
  if (meta.cat) params.set("cat", meta.cat);
  if (meta.fts) params.set("fts", meta.fts);

  const url = `${SHOPSTYLE_BASE}?${params.toString()}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(9000),
  });
  if (!res.ok) {
    const err = new Error(`ShopStyle HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  const text = await res.text();
  // Shutdown pages return HTML
  if (text.trimStart().startsWith("<")) {
    const err = new Error("ShopStyle returned HTML (service closed or blocked)");
    err.status = 503;
    throw err;
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    const err = new Error("ShopStyle invalid JSON");
    err.status = 502;
    throw err;
  }
  if (data?.errorCode || data?.errorMessage) {
    const err = new Error(data.errorMessage || `ShopStyle error ${data.errorCode}`);
    err.status = 502;
    throw err;
  }
  const products = Array.isArray(data.products) ? data.products : [];
  return products.map((p) => normalizeProduct(p, meta)).filter(Boolean);
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

  const pid = process.env.SHOPSTYLE_API_KEY || process.env.SHOPSTYLE_PID || "";
  const limitPerCategory = Math.min(Math.max(Number(body.limitPerCategory) || 30, 5), 50);

  if (!pid) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        source: "backup",
        reason: "missing_api_key",
        items: [],
        message: "Set SHOPSTYLE_API_KEY in Netlify env. Client will use backup catalog.",
      }),
    };
  }

  try {
    const batches = await Promise.allSettled(
      MENS_CATEGORIES.map((meta) => fetchCategory(pid, meta, limitPerCategory))
    );

    const items = [];
    const seen = new Set();
    let failures = 0;
    for (const result of batches) {
      if (result.status !== "fulfilled") {
        failures += 1;
        continue;
      }
      for (const item of result.value) {
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        items.push(item);
      }
    }

    if (!items.length) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          source: "backup",
          reason: failures === MENS_CATEGORIES.length ? "api_unavailable" : "empty_feed",
          items: [],
          failures,
        }),
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        source: "shopstyle",
        reason: null,
        count: items.length,
        failures,
        items,
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
        message: err?.message || "ShopStyle request failed",
      }),
    };
  }
};
