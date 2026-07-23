/**
 * Hard outfit-assembly rules shared by Claude sanitize + local coordinator.
 * Floor for every look: shirt + trouser + shoe + belt.
 * Optional outer: blazer. Bonus accessory: scarf or sunglasses (≤1).
 */

/** Optional outer + required garments (belt handled separately as required floor). */
export const CORE_FAMILIES = ["blazer", "shirt", "trouser", "shoe"];

/** Every outfit must include these four (top, bottom, shoes, belt). */
export const REQUIRED_FLOOR_FAMILIES = ["shirt", "trouser", "shoe", "belt"];

/** Optional bonus — never required; at most one. */
export const BONUS_ACCESSORY_FAMILIES = ["scarf", "sunglasses"];

/** @deprecated use BONUS_ACCESSORY_FAMILIES; kept for swap UI compatibility */
export const ACCESSORY_FAMILIES = ["belt", "scarf", "sunglasses"];

export const APPAREL_FAMILIES = [
  ...CORE_FAMILIES,
  "belt",
  ...BONUS_ACCESSORY_FAMILIES,
];

/** Full suit / tuxedo products that should not stack with another outer. */
export function isFullSuitProduct(item = {}) {
  const name = String(item.name || "");
  if (!/\b(suits?|tuxedo|tux|three[\s-]?piece|two[\s-]?piece)\b/i.test(name)) return false;
  if (/\b(suit\s*jacket|sport\s*coat)\b/i.test(name) && !/\b(suits?\b|tuxedo|three[\s-]?piece|two[\s-]?piece)\b/i.test(name.replace(/suit\s*jacket/gi, ""))) {
    return false;
  }
  return true;
}

/** Non-wearable / junk that must never enter a look. */
export function isNonApparelProduct(item = {}) {
  if (!item) return true;
  const name = String(item.name || "");
  const category = String(item.category || "");
  const corrected = String(item.enrichment?.categoryCorrected || item.categoryCorrected || "").toLowerCase();
  const blob = `${name} ${category} ${corrected}`;

  if (corrected === "other") return true;
  if (item.enrichmentOk === false && corrected === "other") return true;

  if (/\b(cologne|perfume|fragrance|aftershave|eau\s*de\s*(toilette|parfum)|body\s*spray)\b/i.test(blob)) {
    return true;
  }
  if (/\b(mugs?|phone\s*case|pixel\s*case|luggage\s*tag|cufflinks?|tie\s*clip|money\s*clip)\b/i.test(blob)) {
    return true;
  }
  if (/\b(watches?\b|timepiece|smartwatch)\b/i.test(blob) && !/\b(watch\s*pocket)\b/i.test(blob)) {
    return true;
  }
  if (/\b(bags?|backpack|tote|duffel|briefcase|wallet|phone\s*case)\b/i.test(category)
    || /\bnovelty\b/i.test(category)) {
    if (/\bmugs?\b/i.test(name) || /\bcase\b/i.test(name) || corrected === "other") return true;
    if (/^novelty/i.test(category) && !/\b(t-?shirt|tee|shirt)\b/i.test(name)) return true;
  }
  if (/\bbags?\b/i.test(category) && !/\b(shirt|trouser|blazer|shoe|belt)\b/i.test(corrected)) return true;

  const fam = item.family || item.type;
  if (fam && !APPAREL_FAMILIES.includes(fam)) return true;
  if (!fam) return true;

  return false;
}

export function apparelEligible(item) {
  if (!item) return false;
  if (isNonApparelProduct(item)) return false;
  if (item.enrichmentConfidence === "low") return false;
  const fam = item.family || (item.type !== "accessory" ? item.type : null);
  return APPAREL_FAMILIES.includes(fam);
}

/**
 * Collapse an item-key list to ≤1 per garment family, keep belt, ≤1 bonus accessory.
 *
 * @param {string[]} keys
 * @param {(key: string) => object|null|undefined} resolve
 * @returns {string[]}
 */
export function enforceOnePerCategory(keys, resolve) {
  const byFam = new Map();
  let bonus = null;

  for (const key of keys || []) {
    const item = typeof resolve === "function" ? resolve(key) : key;
    if (!item || !apparelEligible(item)) continue;
    const fam = item.family || item.type;
    if (BONUS_ACCESSORY_FAMILIES.includes(fam)) {
      if (!bonus) bonus = item.key || key;
      continue;
    }
    if (![...CORE_FAMILIES, "belt"].includes(fam)) continue;

    if (!byFam.has(fam)) {
      byFam.set(fam, item.key || key);
    }
  }

  // Full suit in blazer + full suit wrongly filed as trouser → drop the suit-trouser
  const blazerKey = byFam.get("blazer");
  const trouserKey = byFam.get("trouser");
  if (blazerKey && trouserKey) {
    const blazer = resolve(blazerKey);
    const trouser = resolve(trouserKey);
    if (isFullSuitProduct(blazer) && isFullSuitProduct(trouser)) {
      byFam.delete("trouser");
    }
  }

  const out = [];
  const rank = new Map((keys || []).map((k, i) => [k, i]));
  const order = ["blazer", "shirt", "trouser", "shoe", "belt"];
  const kept = order.filter((fam) => byFam.has(fam)).map((fam) => byFam.get(fam));
  kept.sort((a, b) => (rank.get(a) ?? 99) - (rank.get(b) ?? 99));
  out.push(...kept);
  if (bonus) out.push(bonus);
  return out;
}

/**
 * After dedupe, ensure required floor slots are filled (and blazer when requireOuter).
 * Uses pickFamily fallbacks — never drops a required category silently.
 */
export function fillMissingCoreSlots(keys, {
  resolve,
  pickFamily,
  requireOuter = false,
  usedKeys = null,
} = {}) {
  const used = usedKeys || new Set(keys);
  let out = [...keys];

  const needed = requireOuter
    ? ["blazer", ...REQUIRED_FLOOR_FAMILIES]
    : [...REQUIRED_FLOOR_FAMILIES];

  // attempt 0 strict → 1 out-of-band OK → 2–3 any coherent item in family
  for (let attempt = 0; attempt < 5; attempt += 1) {
    out = enforceOnePerCategory(out, resolve);
    const byFam = new Map();
    for (const key of out) {
      const item = resolve(key);
      if (!item) continue;
      byFam.set(item.family || item.type, key);
    }

    let added = false;
    const relax = attempt === 0 ? 0 : attempt === 1 ? 1 : 2;
    for (const fam of needed) {
      if (byFam.has(fam)) continue;
      if (typeof pickFamily !== "function") continue;
      // Closest reasonable match: never drop a required category silently
      const picked = pickFamily(fam, used, { byFam, resolve, relax });
      if (picked?.key) {
        used.add(picked.key);
        out.push(picked.key);
        added = true;
      }
    }
    if (!added && hasRequiredFloor(out, resolve) && (!requireOuter || byFam.has("blazer"))) {
      break;
    }
    if (!added) break;
  }
  return enforceOnePerCategory(out, resolve);
}

/**
 * Assert look shape for tests / runtime guards.
 * Floor: shirt + trouser + shoe + belt (always).
 */
export function validateLookShape(items = [], { requireFloor = true, requireOuter = false } = {}) {
  const apparel = items.filter(apparelEligible);
  if (apparel.length !== items.length) {
    return { ok: false, reason: "non-apparel" };
  }
  const counts = {};
  let bonusAccessories = 0;
  for (const item of apparel) {
    const fam = item.family || item.type;
    counts[fam] = (counts[fam] || 0) + 1;
    if (BONUS_ACCESSORY_FAMILIES.includes(fam)) bonusAccessories += 1;
  }
  for (const fam of [...CORE_FAMILIES, "belt"]) {
    if ((counts[fam] || 0) > 1) return { ok: false, reason: `duplicate-${fam}` };
  }
  if (bonusAccessories > 1) return { ok: false, reason: "too-many-accessories" };

  if (requireFloor) {
    for (const fam of REQUIRED_FLOOR_FAMILIES) {
      if (!(counts[fam] > 0)) return { ok: false, reason: `missing-${fam}` };
    }
  }
  if (requireOuter && !(counts.blazer > 0)) {
    return { ok: false, reason: "missing-blazer" };
  }

  const blazer = apparel.find((i) => i.family === "blazer");
  const trouser = apparel.find((i) => i.family === "trouser");
  if (blazer && trouser && isFullSuitProduct(blazer) && isFullSuitProduct(trouser)) {
    return { ok: false, reason: "suit-on-suit" };
  }
  const outers = apparel.filter((i) => i.family === "blazer" || isFullSuitProduct(i));
  if (outers.length > 1 && apparel.filter((i) => i.family === "blazer").length > 1) {
    return { ok: false, reason: "competing-outers" };
  }
  return { ok: true, counts };
}

/** Families present in an item-key list. */
export function familiesInKeys(keys, resolve) {
  const set = new Set();
  for (const key of keys || []) {
    const item = resolve(key);
    if (!item) continue;
    set.add(item.family || item.type);
  }
  return set;
}

export function hasRequiredFloor(keys, resolve) {
  const set = familiesInKeys(keys, resolve);
  return REQUIRED_FLOOR_FAMILIES.every((f) => set.has(f));
}
