/**
 * Mutable product catalog used by the stylist UI.
 * Starts as the hardcoded backup; `applyLiveProducts` merges Awin (or any
 * live feed) items in without breaking recipe stub keys.
 */
import { BACKUP_CATALOG, BACKUP_FAMILY_VARIANTS } from "./backupCatalog.js";
import { enrichItemFormality, formalityScore, itemFitsOccasion, occasionFormalityTarget } from "./formality.js";
import { reclassifyItem, familyCoherent, isJunkProduct } from "./reclassify.js";
import { enrichStyleAttributes } from "./styleAttributes.js";

function cloneCatalog(src) {
  const out = {};
  for (const [k, v] of Object.entries(src)) out[k] = { ...v };
  return out;
}

/** @type {Record<string, object>} */
export let CATALOG = cloneCatalog(BACKUP_CATALOG);

/** @type {Record<string, string[]>} */
export let ITEM_FAMILY_VARIANTS = { ...BACKUP_FAMILY_VARIANTS };

export let catalogSource = "backup";

const COLOR_HEX = {
  Black: "#161616",
  White: "#F5F2E9",
  "Ivory / Cream": "#F5F2E9",
  "Grey / Charcoal": "#4a4a48",
  Navy: "#1f2a44",
  "Camel / Tan": "#6b3f22",
  Olive: "#3E4228",
  Burgundy: "#5c1f2e",
  "Sand / Beige": "#cbb994",
  "Forest Green": "#2f3d2e",
  "Rust / Terracotta": "#8B5A2B",
  "Bold Color": "#C6A567",
};

function rebuildFamilyVariants(catalog) {
  const variants = {
    blazer: [],
    shirt: [],
    trouser: [],
    shoe: [],
    scarf: [],
    belt: [],
    sunglasses: [],
  };
  for (const item of Object.values(catalog)) {
    const fam = item.family || (item.type !== "accessory" ? item.type : null);
    if (fam && variants[fam]) variants[fam].push(item.key);
  }
  for (const fam of Object.keys(variants)) {
    const stubs = BACKUP_FAMILY_VARIANTS[fam] || [];
    const rest = variants[fam].filter((k) => !stubs.includes(k));
    // Prefer live aw-* keys first so stylist picks real products
    const live = rest.filter((k) => /^(aw|ss)-/i.test(k));
    const other = rest.filter((k) => !/^(aw|ss)-/i.test(k));
    variants[fam] = [...live, ...stubs.filter((k) => catalog[k]), ...other];
  }
  return variants;
}

function stubFormalityHint(stub) {
  const key = String(stub.key || "");
  const name = String(stub.name || "").toLowerCase();
  if (key.includes("Black") || key.includes("Navy") || name.includes("tailored") || name.includes("derby") || name.includes("dress")) {
    return { min: 55, max: 100, prefer: 75, hardBan: /\b(cargo|jogger|sweat|hoodie|gym|sneaker|short|glove)\b/i };
  }
  if (key.includes("Alt") || name.includes("linen") || name.includes("wide") || name.includes("chelsea") || name.includes("turtleneck")) {
    return { min: 25, max: 70, prefer: 45, hardBan: /\b(tuxedo|cargo\s*short|glove|hi[- ]?vis)\b/i };
  }
  return { min: 30, max: 85, prefer: 55, hardBan: /\b(glove|hi[- ]?vis|cargo\s*short)\b/i };
}

function scoreStubMatch(stub, live) {
  let score = 0;
  const stubTags = stub.paletteTags || [];
  const liveTags = live.paletteTags || [];
  for (const t of stubTags) {
    if (liveTags.includes(t)) score += 20;
  }
  const stubName = String(stub.name || "").toLowerCase();
  const liveName = String(live.name || "").toLowerCase();
  if (stubName.includes("turtleneck") && liveName.includes("turtleneck")) score += 15;
  if (stubName.includes("linen") && liveName.includes("linen")) score += 10;
  if (stubName.includes("chelsea") && liveName.includes("chelsea")) score += 12;
  if (stubName.includes("wide") && liveName.includes("wide")) score += 8;
  if (stubName.includes("derby") && (liveName.includes("derby") || liveName.includes("oxford"))) score += 14;
  if (String(stub.key).includes("Black") && liveTags.includes("Black")) score += 12;
  if (String(stub.key).includes("Navy") && liveTags.includes("Navy")) score += 12;

  const hint = stubFormalityHint(stub);
  const fit = itemFitsOccasion(live, hint);
  if (!fit.ok) score -= 80;
  else score += Math.min(40, fit.score / 3);

  // Never overlay cargo/workwear onto dress stubs
  if (/\b(cargo|combat|holster|jogger|sweat|hoodie|gym|glove|tool)\b/i.test(liveName)) {
    if (!String(stub.key).includes("Alt")) score -= 100;
  }
  return score;
}

/**
 * Merge live products into the catalog.
 * - Enriches existing recipe stub keys with real name/price/image/shopUrl when possible
 * - Adds every live product as aw-* so Claude can pick from the full feed
 */
export function applyLiveProducts(liveItems = []) {
  if (!Array.isArray(liveItems) || liveItems.length === 0) {
    resetCatalog();
    return { count: Object.keys(CATALOG).length, source: "backup" };
  }

  const next = {};
  const byFamily = {};
  for (const raw of liveItems) {
    if (!raw || raw.id == null) continue;
    if (!raw.shopUrl && !raw.clickUrl) continue;
    if (isJunkProduct(raw)) continue;
    const key = raw.key || `aw-${raw.id}`;
    const tags = raw.paletteTags?.length ? raw.paletteTags : ["Grey / Charcoal"];
    const base = {
      key,
      id: String(raw.id),
      name: raw.name || "Product",
      price: Number(raw.price) || 0,
      retailer: raw.retailer || raw.brand || "Retailer",
      brand: raw.brand || raw.retailer || null,
      type: raw.type || raw.family || "shirt",
      family: raw.family || (raw.type !== "accessory" ? raw.type : raw.accessoryFamily) || "shirt",
      color: raw.color || COLOR_HEX[tags[0]] || "#4a4a48",
      paletteTags: tags,
      image: raw.image || BACKUP_CATALOG.shirt.image,
      searchQuery: raw.searchQuery || raw.name,
      searchNoun: raw.searchNoun || raw.name,
      shopUrl: raw.shopUrl || raw.clickUrl || null,
      clickUrl: raw.clickUrl || raw.shopUrl || null,
      category: raw.category || null,
      description: raw.description || null,
      inStock: raw.inStock !== false,
      source: raw.source || "awin",
    };
    // Name-first family correction — Awin categories are inconsistent
    const fixed = reclassifyItem(base);
    if (!fixed) continue;
    if (!(fixed.brand || fixed.retailer)) continue;
    if (!String(fixed.shopUrl || "").includes("awin1.com") && fixed.source === "awin") {
      // Still allow non-awin1 if present, but prefer awin1 for live feed
    }
    const item = enrichStyleAttributes(enrichItemFormality(fixed));
    next[key] = item;
    const fam = item.family;
    if (fam) {
      if (!byFamily[fam]) byFamily[fam] = [];
      byFamily[fam].push(item);
    }
  }

  if (!Object.keys(next).length) {
    resetCatalog();
    return { count: Object.keys(CATALOG).length, source: "backup" };
  }

  // Overlay best live match onto each backup stub (formality-aware)
  for (const [stubKey, stub] of Object.entries(BACKUP_CATALOG)) {
    const fam = stub.family;
    const pool = byFamily[fam] || [];
    if (!pool.length) continue;
    let best = null;
    let bestScore = -Infinity;
    for (const live of pool) {
      const s = scoreStubMatch(stub, live);
      if (s > bestScore) {
        bestScore = s;
        best = live;
      }
    }
    if (!best || bestScore < -20) continue;
    next[stubKey] = {
      ...best,
      key: stubKey,
      liveKey: best.key,
      // Keep stub key for recipe compatibility but real product identity
      stubOf: stubKey,
    };
  }

  CATALOG = next;
  ITEM_FAMILY_VARIANTS = rebuildFamilyVariants(next);
  catalogSource = "awin";
  return { count: Object.keys(CATALOG).length, source: catalogSource };
}

export function resetCatalog() {
  CATALOG = cloneCatalog(BACKUP_CATALOG);
  for (const [k, item] of Object.entries(CATALOG)) {
    CATALOG[k] = enrichStyleAttributes(enrichItemFormality(item));
  }
  ITEM_FAMILY_VARIANTS = { ...BACKUP_FAMILY_VARIANTS };
  catalogSource = "backup";
  return { count: Object.keys(CATALOG).length, source: catalogSource };
}

export function getCatalogKeys() {
  return Object.keys(CATALOG);
}

/** Live shoppable items only (no fictional backup stubs). */
export function liveCatalogItems() {
  return Object.values(CATALOG).filter(
    (i) => i && i.source === "awin" && i.shopUrl && (i.brand || i.retailer) && /^(aw|ss)-/i.test(i.key),
  );
}

/**
 * Pick the best live product for a garment family given an occasion formality target.
 */
export function pickLiveForFamily(family, {
  prompt = "",
  occasions = [],
  palette = [],
  avoid = [],
  usedKeys = new Set(),
  structureHint = null,
} = {}) {
  const target = occasionFormalityTarget(prompt, occasions);
  const pool = liveCatalogItems().filter(
    (i) => i.family === family && !usedKeys.has(i.key) && familyCoherent(i, family),
  );
  if (!pool.length) {
    const fallback = Object.values(CATALOG).filter(
      (i) => i.family === family && i.shopUrl && !usedKeys.has(i.key) && familyCoherent(i, family),
    );
    if (!fallback.length) return null;
    return pickBest(fallback, target, palette, avoid, structureHint, family);
  }
  return pickBest(pool, target, palette, avoid, structureHint, family);
}

function pickBest(pool, target, palette, avoid, structureHint, family) {
  let best = null;
  let bestScore = -Infinity;
  const active = target?.label === "active";
  const formal = target?.label === "formal" || target?.label === "formal-dark" || target?.label === "smart";
  for (const item of pool) {
    if (!familyCoherent(item, family || item.family)) continue;
    const fit = itemFitsOccasion(item, target);
    if (!fit.ok && fit.score < -100) continue;
    let s = fit.score;
    for (const tag of item.paletteTags || []) {
      if (avoid.includes(tag)) s -= 30;
      if (palette.includes(tag)) s += 8;
    }
    if (structureHint === "tailored" && (item.formality || formalityScore(item)) >= 60) s += 6;
    if (structureHint === "relaxed" && (item.formality || 50) <= 55) s += 4;

    const name = String(item.name || "");
    if (active) {
      if (/\b(gym|athletic|performance|training|jogger|hoodie|sweat|sneaker|trainer|sport)\b/i.test(name)) s += 35;
      if (/\b(suit|blazer|tuxedo|dress\s*shoe|wingtip|loafer|oxford)\b/i.test(name)) s -= 50;
      if (family === "shoe" && !/\b(sneaker|trainer|runner|athletic)\b/i.test(name)) s -= 25;
      if (family === "trouser" && !/\b(jogger|sweat|short|athletic|track|gym)\b/i.test(name)) s -= 15;
    }
    if (formal) {
      if (/\b(suit|tuxedo|blazer|dress\s*(shirt|shoe|pant|trouser)|oxford|derby|wingtip|wool)\b/i.test(name)) s += 20;
      if (/\b(cargo|jogger|hoodie|sneaker|graphic\s*t-?shirt|novelty|walking\s*suit|denim\s*suit)\b/i.test(name)) s -= 40;
      if (target.preferDark && /\b(black|navy|charcoal|dark|grey|gray)\b/i.test(name)) s += 22;
      if (target.preferDark && /\b(red|pink|orange|neon|bright|white\s*prom|mint|mauve|coral|lattice)\b/i.test(name)) s -= 45;
      if (target.label === "formal-dark" && family === "blazer" && /\bblack\b/i.test(name) && !/\bwhite\b/i.test(name)) s += 25;
      if (family === "trouser" && /\b(pant|trouser|chino)\b/i.test(name) && !/\b(suit|blazer)\b/i.test(name)) s += 12;
      if (family === "shirt" && /\bdress\s*shirt\b/i.test(name)) s += 15;
      if (family === "belt" && !/\bbelts?\b/i.test(name)) s -= 80;
    }
    // Accessory slots must be real accessories
    if ((family === "belt" || family === "scarf" || family === "sunglasses") && !familyCoherent(item, family)) {
      continue;
    }
    // Prefer real brand names over empty / generic merchant dumps
    if (item.brand && item.brand !== item.retailer) s += 3;

    if (s > bestScore) {
      bestScore = s;
      best = item;
    }
  }
  return best;
}

export { occasionFormalityTarget, formalityScore, itemFitsOccasion };
