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
  if (/\b(dress|gown|skirt)\b/i.test(name) && fam === "belt") return true;
  if (fam && !APPAREL_FAMILIES.includes(fam)) return true;
  return false;
}

function familyOf(meta) {
  return meta?.family || meta?.type || null;
}

function enforceOnePerCategory(keys, byKey) {
  const byFam = new Map();
  let bonus = null;
  for (const key of keys || []) {
    const item = byKey[key] || byKey.get?.(key);
    if (!item || isNonApparelMeta(item)) continue;
    const fam = familyOf(item);
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

function familiesInKeys(keys, byKey) {
  const set = new Set();
  for (const key of keys || []) {
    const item = byKey[key] || byKey.get?.(key);
    if (!item) continue;
    set.add(familyOf(item));
  }
  return set;
}

function hasRequiredFloor(keys, byKey) {
  const set = familiesInKeys(keys, byKey);
  return REQUIRED_FLOOR_FAMILIES.every((f) => set.has(f));
}

/**
 * Fill missing shirt/trouser/shoe/belt (and blazer when requireOuter) from the
 * catalog cards Claude was given. Prefer occasion-fit items; then any coherent.
 */
function fillMissingCoreSlots(keys, byKey, {
  requireOuter = false,
  formalityTarget = null,
} = {}) {
  const used = new Set(keys || []);
  let out = [...(keys || [])];
  const needed = requireOuter
    ? ["blazer", ...REQUIRED_FLOOR_FAMILIES]
    : [...REQUIRED_FLOOR_FAMILIES];

  const allCards = [];
  if (byKey instanceof Map) {
    for (const [, v] of byKey) allCards.push(v);
  } else {
    for (const v of Object.values(byKey || {})) allCards.push(v);
  }

  const pickFamily = (fam, relax) => {
    const pool = allCards.filter((item) => {
      if (!item?.key || used.has(item.key)) return false;
      if (familyOf(item) !== fam) return false;
      if (isNonApparelMeta(item)) return false;
      if (fam === "belt" && !/\bbelts?\b/i.test(String(item.name || ""))) return false;
      return true;
    });
    if (!pool.length) return null;

    const prefer = Number(formalityTarget?.prefer) || 55;
    const min = Number(formalityTarget?.min) || 0;
    const max = Number(formalityTarget?.max) || 100;
    const hardBanSrc = formalityTarget?.hardBan;
    const hardBan = hardBanSrc
      ? (hardBanSrc instanceof RegExp ? hardBanSrc : new RegExp(hardBanSrc, "i"))
      : null;

    let best = null;
    let bestScore = -Infinity;
    for (const item of pool) {
      const name = String(item.name || "");
      if (relax < 2 && hardBan && hardBan.test(name)) continue;
      const f = Number.isFinite(item.formality) ? item.formality : 50;
      let s = 100 - Math.abs(f - prefer);
      if (f >= min && f <= max) s += 25;
      else if (relax < 1) continue;
      if (relax >= 1 && (f < min - 8 || f > max + 8)) s -= 30;
      if (s > bestScore) {
        bestScore = s;
        best = item;
      }
    }
    return best;
  };

  for (let attempt = 0; attempt < 5; attempt += 1) {
    out = enforceOnePerCategory(out, byKey);
    const have = familiesInKeys(out, byKey);
    let added = false;
    const relax = attempt === 0 ? 0 : attempt === 1 ? 1 : 2;
    for (const fam of needed) {
      if (have.has(fam)) continue;
      const picked = pickFamily(fam, relax);
      if (picked?.key) {
        used.add(picked.key);
        out.push(picked.key);
        added = true;
      }
    }
    if (!added) break;
  }
  return enforceOnePerCategory(out, byKey);
}

module.exports = {
  CORE_FAMILIES,
  REQUIRED_FLOOR_FAMILIES,
  BONUS_ACCESSORY_FAMILIES,
  ACCESSORY_FAMILIES,
  APPAREL_FAMILIES,
  enforceOnePerCategory,
  fillMissingCoreSlots,
  hasRequiredFloor,
  isNonApparelMeta,
};
