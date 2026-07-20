/**
 * Mutable product catalog used by the stylist UI.
 * Starts as the hardcoded backup; `applyLiveProducts` merges ShopStyle (or any
 * live feed) items in without breaking recipe stub keys.
 */
import { BACKUP_CATALOG, BACKUP_FAMILY_VARIANTS } from "./backupCatalog.js";

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
  // Keep backup stub order first so recipes stay stable
  for (const fam of Object.keys(variants)) {
    const stubs = BACKUP_FAMILY_VARIANTS[fam] || [];
    const rest = variants[fam].filter((k) => !stubs.includes(k));
    variants[fam] = [...stubs.filter((k) => catalog[k]), ...rest];
  }
  return variants;
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
  if (stubName.includes("derby") && (liveName.includes("derby") || liveName.includes("oxford"))) score += 10;
  if (String(stub.key).includes("Black") && liveTags.includes("Black")) score += 12;
  if (String(stub.key).includes("Navy") && liveTags.includes("Navy")) score += 12;
  if (String(stub.key).includes("Alt") && (liveName.includes("relaxed") || liveName.includes("casual") || liveName.includes("oversized"))) {
    score += 4;
  }
  return score;
}

/**
 * Merge live products into the catalog.
 * - Enriches existing recipe stub keys with real name/price/image/shopUrl when possible
 * - Adds every live product as `ss-{id}` so Claude can pick from the full feed
 */
export function applyLiveProducts(liveItems = []) {
  if (!Array.isArray(liveItems) || liveItems.length === 0) {
    resetCatalog();
    return { count: Object.keys(CATALOG).length, source: "backup" };
  }

  const next = cloneCatalog(BACKUP_CATALOG);
  const byFamily = {};
  for (const raw of liveItems) {
    if (!raw || raw.id == null) continue;
    const family = raw.family || (raw.type !== "accessory" ? raw.type : raw.accessoryFamily) || null;
    const key = raw.key || `ss-${raw.id}`;
    const tags = raw.paletteTags?.length ? raw.paletteTags : ["Grey / Charcoal"];
    const item = {
      key,
      id: String(raw.id),
      name: raw.name || "Product",
      price: Number(raw.price) || 0,
      retailer: raw.retailer || raw.brand || "Retailer",
      brand: raw.brand || null,
      type: raw.type || family || "shirt",
      family: family || raw.type || "shirt",
      color: raw.color || COLOR_HEX[tags[0]] || "#4a4a48",
      paletteTags: tags,
      image: raw.image || BACKUP_CATALOG.shirt.image,
      searchQuery: raw.searchQuery || raw.name,
      searchNoun: raw.searchNoun || raw.name,
      shopUrl: raw.shopUrl || raw.clickUrl || null,
      inStock: raw.inStock !== false,
      source: raw.source || "shopstyle",
    };
    next[key] = item;
    if (family) {
      if (!byFamily[family]) byFamily[family] = [];
      byFamily[family].push(item);
    }
  }

  // Overlay best live match onto each backup stub so recipes keep working
  for (const [stubKey, stub] of Object.entries(BACKUP_CATALOG)) {
    const fam = stub.family;
    const pool = byFamily[fam] || [];
    if (!pool.length) continue;
    let best = pool[0];
    let bestScore = -Infinity;
    for (const live of pool) {
      const s = scoreStubMatch(stub, live);
      if (s > bestScore) {
        bestScore = s;
        best = live;
      }
    }
    next[stubKey] = {
      ...stub,
      id: best.id,
      name: best.name,
      price: best.price,
      retailer: best.retailer,
      brand: best.brand,
      color: best.color || stub.color,
      paletteTags: best.paletteTags?.length ? best.paletteTags : stub.paletteTags,
      image: best.image || stub.image,
      searchQuery: best.searchQuery || stub.searchQuery,
      searchNoun: best.searchNoun || stub.searchNoun,
      shopUrl: best.shopUrl,
      inStock: best.inStock !== false,
      source: best.source || "shopstyle",
      liveKey: best.key,
    };
  }

  CATALOG = next;
  ITEM_FAMILY_VARIANTS = rebuildFamilyVariants(next);
  catalogSource = "shopstyle";
  return { count: Object.keys(CATALOG).length, source: catalogSource };
}

export function resetCatalog() {
  CATALOG = cloneCatalog(BACKUP_CATALOG);
  ITEM_FAMILY_VARIANTS = { ...BACKUP_FAMILY_VARIANTS };
  catalogSource = "backup";
  return { count: Object.keys(CATALOG).length, source: catalogSource };
}

export function getCatalogKeys() {
  return Object.keys(CATALOG);
}
