/**
 * Serper Google Shopping client (pay-as-you-go credits).
 * Env: SERPER_API_KEY — when missing, search is a no-op (Awin-only path).
 */
const SERPER_SHOPPING_URL = "https://google.serper.dev/shopping";
const DEFAULT_TIMEOUT_MS = 2800;
const DEFAULT_NUM = 8;

function serperConfigured() {
  return Boolean(String(process.env.SERPER_API_KEY || "").trim());
}

function parsePrice(raw) {
  if (raw == null) return 0;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  const s = String(raw).replace(/[^0-9.,]/g, "").replace(/,/g, "");
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Normalize one Serper shopping hit into a Vestra catalog-shaped card.
 * @param {object} hit
 * @param {string} family
 * @param {number} index
 */
function normalizeShoppingHit(hit, family, index = 0) {
  if (!hit || typeof hit !== "object") return null;
  const title = String(hit.title || hit.name || "").trim();
  const link = String(hit.link || hit.productLink || hit.url || "").trim();
  if (!title || !link) return null;
  const image = String(hit.imageUrl || hit.thumbnail || hit.image || "").trim();
  const retailer = String(hit.source || hit.merchant || hit.seller || "Online").trim();
  const price = parsePrice(hit.price ?? hit.extracted_price ?? hit.extractedPrice);
  const id = `serper-${family}-${index}-${Buffer.from(link).toString("base64url").slice(0, 18)}`;
  const key = `web-${id}`;
  return {
    key,
    id,
    name: title.slice(0, 120),
    price,
    priceMissing: !price,
    retailer,
    brand: retailer,
    type: family,
    family,
    category: family,
    color: "#4a4a48",
    paletteTags: [],
    colors: [],
    image: image || "",
    searchQuery: title,
    searchNoun: title,
    shopUrl: link,
    clickUrl: link,
    inStock: true,
    source: "serper",
    formality: familyFormalityHint(family, title),
    formalityBand: null,
    cut: "straight",
    isNeutral: true,
    webSearch: true,
  };
}

function familyFormalityHint(family, title) {
  const t = `${family} ${title}`.toLowerCase();
  if (/\b(tuxedo|oxford|derby|loafer|dress\s*shoe|wingtip|monk)\b/.test(t)) return 72;
  if (/\b(sneaker|trainer|runner|skate|canvas)\b/.test(t)) return 28;
  if (family === "belt") return 55;
  if (family === "shoe") return 58;
  if (family === "blazer") return 70;
  if (family === "trouser") return 55;
  if (family === "shirt") return 50;
  if (family === "sunglasses") return 45;
  if (family === "scarf") return 48;
  return 50;
}

/**
 * @param {string} query
 * @param {{ num?: number, gl?: string, hl?: string, timeoutMs?: number }} [opts]
 * @returns {Promise<object[]>}
 */
async function searchShopping(query, opts = {}) {
  const apiKey = String(process.env.SERPER_API_KEY || "").trim();
  if (!apiKey || !query) return [];

  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(SERPER_SHOPPING_URL, {
      method: "POST",
      headers: {
        "X-API-KEY": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        q: query,
        num: opts.num ?? DEFAULT_NUM,
        gl: opts.gl || "us",
        hl: opts.hl || "en",
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.warn(JSON.stringify({
        event: "SERPER_SHOPPING_ERROR",
        status: res.status,
        detail: String(detail).slice(0, 200),
      }));
      return [];
    }
    const data = await res.json();
    const hits = Array.isArray(data.shopping) ? data.shopping
      : Array.isArray(data.shopping_results) ? data.shopping_results
        : Array.isArray(data.products) ? data.products
          : [];
    return hits;
  } catch (err) {
    console.warn(JSON.stringify({
      event: "SERPER_SHOPPING_FAIL",
      error: String(err.message || err).slice(0, 200),
    }));
    return [];
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  serperConfigured,
  searchShopping,
  normalizeShoppingHit,
  parsePrice,
  familyFormalityHint,
};
