/**
 * Formality scoring from real product text (name / category / description).
 * Used so wedding ≠ cargo pants and gym ≠ blazers once the Awin feed is live.
 */

const FORMAL_POS = [
  [/\b(tuxedo|tux|black\s*tie|dinner\s*jacket|shawl\s*lapel)\b/i, 40],
  [/\b(suit|suits|wedding|prom|formal|morning\s*coat)\b/i, 32],
  [/\b(blazer|sport\s*coat|suit\s*jacket|tailored|bespoke)\b/i, 24],
  [/\b(dress\s*(shirt|pant|shoe|trouser)|oxford|derby|brogue|loafer|monk)\b/i, 22],
  [/\b(wool|tweed|velvet|satin|silk|chiffon|pleated)\b/i, 10],
  [/\b(chino|smart\s*casual|business|office|interview)\b/i, 12],
  [/\b(tie|waistcoat|vest|cufflink)\b/i, 8],
];

const FORMAL_NEG = [
  [/\b(cargo|camo|combat|holster|tactical|work\s*trouser|painter|dungaree)\b/i, 45],
  [/\b(jogger|sweatpants?|hoodie|tracksuit|track\s*pant|gym|athletic|performance|training)\b/i, 42],
  // shorts / trainers — but NOT "short sleeve" or "short suit" (tailoring cut)
  [/\b((?:cargo|chino|denim|athletic|gym|swim|board)\s+)?shorts\b/i, 35],
  [/\b(flip\s*flop|sandal|slider|trainer|sneaker|runner)\b/i, 35],
  [/\b(jean|denim|ripped|distressed)\b/i, 18],
  [/\b(glove|tool|framer|hi[- ]?vis|safety|sock)\b/i, 50],
  [/\b(woman|women|ladies|womens|girl)\b/i, 40],
];

const ACTIVE_POS = [
  [/\b(gym|athletic|performance|training|sport|hoodie|jogger|sweatpants?|sweatshirt|track)\b/i, 40],
  [/\b(sneaker|trainer|runner)\b/i, 28],
  [/\b((?:gym|athletic|sport)\s+)?shorts\b/i, 24],
  [/\b(polo|tee|t-shirt|jersey)\b/i, 12],
];

const ACTIVE_NEG = [
  [/\b(tuxedo|suit|blazer|dress\s*shoe|oxford|derby|loafer|tie|wingtip|monk)\b/i, 45],
  [/\b(formal|wedding|prom|seersucker)\b/i, 35],
];

export function itemTextBlob(item = {}) {
  return [
    item.name,
    item.category,
    item.searchQuery,
    item.searchNoun,
    item.description,
    item.brand,
    item.retailer,
    item.family,
    item.type,
  ].filter(Boolean).join(" ");
}

function applyRules(text, rules) {
  let score = 0;
  for (const [re, pts] of rules) {
    if (re.test(text)) score += pts;
  }
  return score;
}

/** 0 (active/workwear) → 100 (black-tie). */
export function formalityScore(item) {
  const text = itemTextBlob(item);
  if (!text.trim()) return 50;
  let score = 48;
  score += applyRules(text, FORMAL_POS);
  score -= applyRules(text, FORMAL_NEG);
  // Activewear pulls down unless it's clearly formal
  const activePull = applyRules(text, ACTIVE_POS) - applyRules(text, ACTIVE_NEG);
  if (activePull > 0) score -= Math.min(35, activePull);

  // Family baselines
  const fam = item.family || item.type;
  if (fam === "blazer") score += 8;
  if (fam === "shoe" && /\b(sneaker|trainer|runner|boot)\b/i.test(text)) score -= 8;
  if (fam === "shoe" && /\b(oxford|derby|loafer|dress)\b/i.test(text)) score += 10;
  if (fam === "trouser" && /\b(suit|dress|wool|tuxedo)\b/i.test(text)) score += 12;
  if (fam === "shirt" && /\b(hoodie|sweat|tee|t-shirt)\b/i.test(text)) score -= 14;
  if (fam === "shirt" && /\b(dress\s*shirt|oxford|french\s*cuff)\b/i.test(text)) score += 12;

  return Math.max(0, Math.min(100, score));
}

export function formalityBand(score) {
  if (score >= 72) return "formal";
  if (score >= 55) return "smart";
  if (score >= 35) return "casual";
  return "active";
}

/**
 * Target formality window for a prompt / detected occasions.
 * Returns { min, max, prefer, label, hardBan }.
 */
export function occasionFormalityTarget(prompt = "", occasions = []) {
  const p = String(prompt || "").toLowerCase();
  const o = new Set(occasions || []);

  if (
    o.has("active")
    || /\b(gym|workout|athletic|run|sport|exercise|training)\b/.test(p)
  ) {
    return {
      min: 0,
      max: 40,
      prefer: 18,
      label: "active",
      hardBan: /\b(tuxedo|suit\b|blazer|sport\s*coat|dress\s*shoe|oxford|derby|loafer|wingtip|monk|tie|waistcoat|formal|wedding|prom)\b/i,
      requireOuter: false,
      forbidOuter: true,
    };
  }

  if (
    o.has("wedding")
    || /\b(wedding|black\s*tie|gala|ceremony|tuxedo|tux)\b/.test(p)
  ) {
    return {
      min: 68,
      max: 100,
      prefer: 82,
      label: "formal",
      hardBan: /\b(cargo|camo|combat|jogger|sweatpants?|hoodie|gym|athletic|sneaker|trainer|shorts\b|jean|denim|glove|tool|sock)\b/i,
      requireOuter: true,
      forbidOuter: false,
    };
  }

  if (
    o.has("funeral")
    || /\b(funeral|memorial|wake|mourning|bereavement)\b/.test(p)
  ) {
    return {
      min: 70,
      max: 100,
      prefer: 80,
      label: "formal-dark",
      hardBan: /\b(cargo|camo|jogger|sweatpants?|hoodie|gym|sneaker|shorts\b|neon|bright|red\s*suit|prom|sock|jean|denim|seersucker)\b/i,
      requireOuter: true,
      preferDark: true,
      forbidOuter: false,
    };
  }

  if (
    o.has("work")
    || /\b(interview|job\s*interview|office|meeting|client|work\s*dinner|business)\b/.test(p)
  ) {
    return {
      min: 58,
      max: 92,
      prefer: 72,
      label: "smart",
      hardBan: /\b(cargo|camo|jogger|sweatpants?|hoodie|gym|sneaker|shorts\b|ripped|distressed|glove|sock)\b/i,
      requireOuter: true,
      forbidOuter: false,
    };
  }

  if (
    o.has("sexy")
    || o.has("dinner")
    || /\b(first\s*date|date\s*night|night\s*out|evening|restaurant)\b/.test(p)
  ) {
    return {
      min: 48,
      max: 88,
      prefer: 68,
      label: "smart-evening",
      hardBan: /\b(cargo|camo|jogger|sweatpants?|hoodie|gym|shorts\b|glove|tool|hi[- ]?vis|sock)\b/i,
      requireOuter: false,
      forbidOuter: false,
    };
  }

  if (
    o.has("weekend")
    || o.has("everyday")
    || o.has("street")
    || /\b(weekend|casual|brunch|everyday|nothing\s*fussy|chill)\b/.test(p)
  ) {
    return {
      min: 20,
      max: 62,
      prefer: 40,
      label: "casual",
      hardBan: /\b(tuxedo|black\s*tie|morning\s*coat|ball\s*gown)\b/i,
      requireOuter: false,
      forbidOuter: false,
    };
  }

  // Default: smart-casual band
  return {
    min: 35,
    max: 75,
    prefer: 55,
    label: "smart-casual",
    hardBan: /\b(cargo\s*short|glove|hi[- ]?vis|safety)\b/i,
    requireOuter: false,
    forbidOuter: false,
  };
}

export function itemFitsOccasion(item, target) {
  if (!item || !target) return { ok: false, score: -999 };
  const text = itemTextBlob(item);
  if (target.hardBan && target.hardBan.test(text)) {
    return { ok: false, score: -500, reason: "hardBan" };
  }
  const fam = item.family || item.type;
  if (target.forbidOuter && fam === "blazer") {
    return { ok: false, score: -400, reason: "forbidOuter" };
  }
  const f = Number.isFinite(item.formality) ? item.formality : formalityScore(item);
  if (f < target.min - 8 || f > target.max + 8) {
    return { ok: false, score: -200 + f, reason: "outOfBand" };
  }
  let score = 100 - Math.abs(f - target.prefer);
  if (f >= target.min && f <= target.max) score += 25;
  if (target.preferDark) {
    if (/\b(black|navy|charcoal|dark|grey|gray)\b/i.test(text)) score += 15;
    if (/\b(red|pink|orange|neon|bright|gold|tiffany)\b/i.test(text)) score -= 25;
  }
  return { ok: score > 0, score, formality: f };
}

export function enrichItemFormality(item) {
  if (!item) return item;
  const formality = formalityScore(item);
  return {
    ...item,
    formality,
    formalityBand: formalityBand(formality),
    category: item.category || null,
  };
}
