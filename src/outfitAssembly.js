/**
 * Hard outfit-assembly rules shared by Claude sanitize + local coordinator.
 * One garment per core family; apparel only; regenerate why from final pieces.
 */

export const CORE_FAMILIES = ["blazer", "shirt", "trouser", "shoe"];
export const ACCESSORY_FAMILIES = ["belt", "scarf", "sunglasses"];
export const APPAREL_FAMILIES = [...CORE_FAMILIES, ...ACCESSORY_FAMILIES];

/** Full suit / tuxedo products that should not stack with another outer. */
export function isFullSuitProduct(item = {}) {
  const name = String(item.name || "");
  if (!/\b(suits?|tuxedo|tux|three[\s-]?piece|two[\s-]?piece)\b/i.test(name)) return false;
  // Suit jacket / blazer alone is an outer, not a competing full suit stack by itself
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
    // Novelty T-Shirts category is full of mug SKUs; real tees still have shirt-like names
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
 * Collapse an item-key list to ≤1 per core family and ≤1 accessory.
 * Prefer keeping the first occurrence (Claude order) unless a later piece is
 * clearly better for a slot that already has a competing full-suit.
 *
 * @param {string[]} keys
 * @param {(key: string) => object|null|undefined} resolve
 * @returns {string[]}
 */
export function enforceOnePerCategory(keys, resolve) {
  const coreOrder = [];
  const byFam = new Map();
  let accessory = null;

  for (const key of keys || []) {
    const item = typeof resolve === "function" ? resolve(key) : key;
    if (!item || !apparelEligible(item)) continue;
    const fam = item.family || item.type;
    if (ACCESSORY_FAMILIES.includes(fam)) {
      if (!accessory) accessory = item.key || key;
      continue;
    }
    if (!CORE_FAMILIES.includes(fam)) continue;

    if (!byFam.has(fam)) {
      byFam.set(fam, item.key || key);
      coreOrder.push(fam);
      continue;
    }

    // Competing second item in same family — keep the first (never stack suits/jackets)
    continue;
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
  for (const fam of CORE_FAMILIES) {
    if (byFam.has(fam)) out.push(byFam.get(fam));
  }
  // Preserve original relative order for any core fams we walked (belt last)
  // Re-sort out to match first-seen order among kept keys
  const rank = new Map((keys || []).map((k, i) => [k, i]));
  out.sort((a, b) => (rank.get(a) ?? 99) - (rank.get(b) ?? 99));
  if (accessory) out.push(accessory);
  return out;
}

/**
 * After dedupe, ensure core slots are filled when possible.
 */
export function fillMissingCoreSlots(keys, {
  resolve,
  pickFamily,
  requireOuter = false,
  usedKeys = null,
} = {}) {
  const used = usedKeys || new Set(keys);
  let out = [...keys];

  for (let attempt = 0; attempt < 3; attempt += 1) {
    out = enforceOnePerCategory(out, resolve);
    const byFam = new Map();
    for (const key of out) {
      const item = resolve(key);
      if (!item) continue;
      byFam.set(item.family || item.type, key);
    }

    let added = false;
    for (const fam of CORE_FAMILIES) {
      if (byFam.has(fam)) continue;
      if (fam === "blazer" && !requireOuter) continue;
      if (typeof pickFamily !== "function") continue;
      const picked = pickFamily(fam, used, { byFam, resolve });
      if (picked?.key) {
        used.add(picked.key);
        out.push(picked.key);
        added = true;
      }
    }
    if (!added) break;
  }
  return enforceOnePerCategory(out, resolve);
}

/**
 * Assert look shape for tests / runtime guards.
 */
export function validateLookShape(items = []) {
  const apparel = items.filter(apparelEligible);
  if (apparel.length !== items.length) {
    return { ok: false, reason: "non-apparel" };
  }
  const counts = {};
  let accessories = 0;
  for (const item of apparel) {
    const fam = item.family || item.type;
    counts[fam] = (counts[fam] || 0) + 1;
    if (ACCESSORY_FAMILIES.includes(fam)) accessories += 1;
  }
  for (const fam of CORE_FAMILIES) {
    if ((counts[fam] || 0) > 1) return { ok: false, reason: `duplicate-${fam}` };
  }
  if (accessories > 1) return { ok: false, reason: "too-many-accessories" };

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
