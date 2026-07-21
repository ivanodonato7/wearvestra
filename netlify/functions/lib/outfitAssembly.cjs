/**
 * CJS mirror of src/outfitAssembly.js for Netlify stylist function.
 */
const CORE_FAMILIES = ["blazer", "shirt", "trouser", "shoe"];
const ACCESSORY_FAMILIES = ["belt", "scarf", "sunglasses"];
const APPAREL_FAMILIES = [...CORE_FAMILIES, ...ACCESSORY_FAMILIES];

function isFullSuitProduct(item = {}) {
  const name = String(item.name || "");
  return /\b(suits?|tuxedo|tux|three[\s-]?piece|two[\s-]?piece)\b/i.test(name);
}

function isNonApparelMeta(meta = {}) {
  const name = String(meta.name || "");
  const category = String(meta.category || "");
  const corrected = String(meta.categoryCorrected || meta.correctedCategory || "").toLowerCase();
  const fam = meta.family || meta.type;
  if (corrected === "other") return true;
  if (/\b(cologne|perfume|fragrance|aftershave|mug|cufflink|watch|phone\s*case|luggage)\b/i.test(`${name} ${category}`)) {
    return true;
  }
  if (fam && !APPAREL_FAMILIES.includes(fam)) return true;
  return false;
}

function enforceOnePerCategory(keys, byKey) {
  const byFam = new Map();
  let accessory = null;
  for (const key of keys || []) {
    const meta = byKey.get(key);
    if (!meta || isNonApparelMeta(meta)) continue;
    const fam = meta.family || meta.type;
    if (ACCESSORY_FAMILIES.includes(fam)) {
      if (!accessory) accessory = key;
      continue;
    }
    if (!CORE_FAMILIES.includes(fam)) continue;
    if (!byFam.has(fam)) byFam.set(fam, key);
  }
  const blazerKey = byFam.get("blazer");
  const trouserKey = byFam.get("trouser");
  if (blazerKey && trouserKey) {
    const blazer = byKey.get(blazerKey);
    const trouser = byKey.get(trouserKey);
    if (isFullSuitProduct(blazer) && isFullSuitProduct(trouser)) {
      byFam.delete("trouser");
    }
  }
  const out = [];
  const rank = new Map((keys || []).map((k, i) => [k, i]));
  for (const fam of CORE_FAMILIES) {
    if (byFam.has(fam)) out.push(byFam.get(fam));
  }
  out.sort((a, b) => (rank.get(a) ?? 99) - (rank.get(b) ?? 99));
  if (accessory) out.push(accessory);
  return out;
}

module.exports = {
  CORE_FAMILIES,
  ACCESSORY_FAMILIES,
  enforceOnePerCategory,
  isNonApparelMeta,
  isFullSuitProduct,
};
