/**
 * Hybrid web search for thin catalog families (belt/shoe/etc.).
 * Fills gaps with Serper Shopping results; prefers Awin when coverage is healthy.
 */
const { serperConfigured, searchShopping, normalizeShoppingHit } = require("./serperShopping.cjs");
const { monetizeProductCard } = require("./affiliateLinks.cjs");

/** Families we may backfill from the live web when Awin pool is thin. */
const THIN_TARGET_FAMILIES = ["belt", "shoe", "sunglasses", "scarf"];
/** Below this many cards in the stylist payload → consider family thin. */
const THIN_THRESHOLD = {
  belt: 12,
  shoe: 18,
  sunglasses: 8,
  scarf: 6,
};

function familyOf(item) {
  return item?.family || item?.type || null;
}

function countByFamily(catalogItems = []) {
  const counts = Object.create(null);
  for (const item of catalogItems) {
    const fam = familyOf(item);
    if (!fam) continue;
    counts[fam] = (counts[fam] || 0) + 1;
  }
  return counts;
}

function thinFamilies(catalogItems = []) {
  const counts = countByFamily(catalogItems);
  return THIN_TARGET_FAMILIES.filter((fam) => (counts[fam] || 0) < (THIN_THRESHOLD[fam] || 10));
}

function isDressyPrompt(prompt = "") {
  return /\b(wedding|funeral|black[\s-]?tie|interview|office|boardroom|formal|gala|suit)\b/i.test(prompt);
}

function isActivePrompt(prompt = "") {
  return /\b(gym|workout|run|athletic|training|sport)\b/i.test(prompt);
}

/**
 * Build a menswear Google Shopping query for a garment role.
 */
function buildFamilySearchQuery(family, { prompt = "", profile = {}, formalityTarget = null } = {}) {
  const palette = Array.isArray(profile.palette) ? profile.palette : [];
  const color = String(palette[0] || "").replace(/\s*\/\s*.*$/, "").trim();
  const dressy = isDressyPrompt(prompt) || (Number(formalityTarget?.prefer) || 0) >= 65;
  const active = isActivePrompt(prompt) || (Number(formalityTarget?.prefer) || 50) <= 30;

  const base = {
    belt: dressy ? "mens leather dress belt" : "mens leather belt casual",
    shoe: active
      ? "mens sneakers athletic"
      : dressy
        ? "mens leather dress shoes oxford derby"
        : "mens casual leather shoes loafers",
    sunglasses: "mens sunglasses",
    scarf: "mens wool scarf",
    shirt: dressy ? "mens dress shirt" : "mens casual button shirt",
    trouser: dressy ? "mens dress trousers" : "mens chinos",
    blazer: "mens blazer sport coat",
  }[family] || `mens ${family}`;

  return [base, color && color.toLowerCase() !== "bold color" ? color : null, "men"]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Search Serper in parallel for thin families and return monetized catalog cards.
 * @returns {Promise<{ cards: object[], families: string[], queries: object, skipped: string|null }>}
 */
async function fetchHybridWebProducts({
  catalogItems = [],
  prompt = "",
  profile = {},
  formalityTarget = null,
  timeoutMs = 2800,
  maxPerFamily = 5,
} = {}) {
  if (!serperConfigured()) {
    return { cards: [], families: [], queries: {}, skipped: "serper_unconfigured" };
  }

  const families = thinFamilies(catalogItems);
  if (!families.length) {
    return { cards: [], families: [], queries: {}, skipped: "catalog_coverage_ok" };
  }

  const queries = {};
  const tasks = families.map(async (family) => {
    const q = buildFamilySearchQuery(family, { prompt, profile, formalityTarget });
    queries[family] = q;
    const hits = await searchShopping(q, { timeoutMs, num: Math.max(maxPerFamily, 6) });
    const cards = [];
    for (let i = 0; i < hits.length && cards.length < maxPerFamily; i += 1) {
      const raw = normalizeShoppingHit(hits[i], family, i);
      if (!raw) continue;
      // Drop empty images — ShopSheet / outfit tiles need a photo
      if (!raw.image || raw.image.startsWith("data:")) continue;
      cards.push(monetizeProductCard(raw));
    }
    return cards;
  });

  const settled = await Promise.all(tasks);
  const cards = settled.flat();
  console.info(JSON.stringify({
    event: "HYBRID_WEB_SEARCH",
    families,
    queries,
    cardCount: cards.length,
  }));
  return { cards, families, queries, skipped: null };
}

/**
 * Merge web cards into stylist catalog payload (keys + items + byKey Map).
 */
function mergeWebCardsIntoCatalog({ catalogKeys = [], catalogItems = [], webCards = [] }) {
  if (!webCards.length) {
    return { catalogKeys, catalogItems, webProducts: {} };
  }
  const byKey = new Map((catalogItems || []).map((i) => [i.key, i]));
  const keys = [...catalogKeys];
  const items = [...catalogItems];
  const webProducts = {};

  for (const card of webCards) {
    if (!card?.key || byKey.has(card.key)) continue;
    byKey.set(card.key, card);
    keys.push(card.key);
    items.push({
      key: card.key,
      name: card.name,
      family: card.family,
      category: card.category,
      brand: card.brand,
      formality: card.formality,
      formalityBand: card.formalityBand,
      colors: card.colors || card.paletteTags || [],
      cut: card.cut || "straight",
      isNeutral: true,
      source: "serper",
    });
    webProducts[card.key] = card;
  }

  return { catalogKeys: keys, catalogItems: items, webProducts, byKey };
}

module.exports = {
  THIN_TARGET_FAMILIES,
  THIN_THRESHOLD,
  thinFamilies,
  countByFamily,
  buildFamilySearchQuery,
  fetchHybridWebProducts,
  mergeWebCardsIntoCatalog,
  isDressyPrompt,
  isActivePrompt,
};
