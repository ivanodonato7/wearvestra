/**
 * CommonJS mirror of src/outfitAssembly.js for Netlify stylist sanitization.
 */
const CORE_FAMILIES = ["blazer", "shirt", "trouser", "shoe"];
const REQUIRED_FLOOR_FAMILIES = ["shirt", "trouser", "shoe", "belt"];
const BONUS_ACCESSORY_FAMILIES = ["scarf", "sunglasses"];
const ACCESSORY_FAMILIES = ["belt", "scarf", "sunglasses"];
const APPAREL_FAMILIES = [...CORE_FAMILIES, "belt", ...BONUS_ACCESSORY_FAMILIES];

function isNonApparelMeta(meta = {}) {
  const name = String(meta.name || "");
  const category = String(meta.category || "");
  const fam = meta.family || meta.type;
  const blob = `${name} ${category}`;
  if (/\b(cologne|perfume|fragrance|mugs?|phone\s*case|cufflinks?)\b/i.test(blob)) return true;
  if (fam && !APPAREL_FAMILIES.includes(fam)) return true;
  return false;
}

function enforceOnePerCategory(keys, byKey) {
  const byFam = new Map();
  let bonus = null;
  for (const key of keys || []) {
    const item = byKey[key] || byKey.get?.(key);
    if (!item) continue;
    const fam = item.family || item.type;
    if (!fam) continue;
    if (BONUS_ACCESSORY_FAMILIES.includes(fam)) {
      if (!bonus) bonus = key;
      continue;
    }
    if (![...CORE_FAMILIES, "belt"].includes(fam)) continue;
    if (!byFam.has(fam)) byFam.set(fam, key);
  }
  const order = ["blazer", "shirt", "trouser", "shoe", "belt"];
  const out = order.filter((f) => byFam.has(f)).map((f) => byFam.get(f));
  if (bonus) out.push(bonus);
  return out;
}

module.exports = {
  CORE_FAMILIES,
  REQUIRED_FLOOR_FAMILIES,
  BONUS_ACCESSORY_FAMILIES,
  ACCESSORY_FAMILIES,
  APPAREL_FAMILIES,
  enforceOnePerCategory,
  isNonApparelMeta,
};
