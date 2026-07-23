/**
 * Outfit "Style inspiration" hero picker.
 * Chooses a curated stock photo from /public/heroes based on the generated
 * look's garment colors + formality — not a static occasion slug alone.
 *
 * Preference order: color match → formality match → neutral formal-level
 * fallback. Strong color clashes (e.g. navy photo vs grey suit) are penalized.
 */

const ASSET_V = "outfithero2";
const assetUrl = (path) => `${path}?v=${ASSET_V}`;

/** Neutral families — safe when an exact color match is missing. */
const NEUTRAL_COLORS = new Set(["black", "grey", "cream", "beige", "white", "camel", "brown"]);

/**
 * Curated stock set with color + formality tags (Unsplash License assets).
 * Paths are under /public.
 */
export const OUTFIT_HERO_CATALOG = [
  { file: "/heroes/home/01-quiet-A.jpg", colors: ["olive", "white"], formality: "smart", note: "olive suit" },
  { file: "/heroes/home/01-quiet-B.jpg", colors: ["navy", "white", "cream"], formality: "formal", note: "navy blazer cream trousers" },
  { file: "/heroes/home/01-quiet-C.jpg", colors: ["navy", "white"], formality: "formal", note: "navy suit tie" },
  { file: "/heroes/home/02-relaxed-A.jpg", colors: ["grey", "cream", "navy"], formality: "smart", note: "grey blazer cream trousers" },
  { file: "/heroes/home/03-modern-A.jpg", colors: ["black"], formality: "smart", note: "all-black modern" },
  { file: "/heroes/home/03-modern-B.jpg", colors: ["black"], formality: "evening", note: "black suit evening" },
  { file: "/heroes/home/03-modern-C.jpg", colors: ["black"], formality: "evening", note: "black suit crop" },
  { file: "/heroes/home/04-warm-A.jpg", colors: ["camel", "beige", "brown"], formality: "smart", note: "camel coat knit" },
  { file: "/heroes/home/04-warm-C.jpg", colors: ["black"], formality: "casual", note: "black turtleneck" },
  { file: "/heroes/home/05-classic-A.jpg", colors: ["navy", "white", "cream"], formality: "formal", note: "navy blazer classic" },
  { file: "/heroes/home/05-classic-C.jpg", colors: ["navy", "white", "brown"], formality: "smart", note: "navy suit brown shoes" },
  { file: "/heroes/home/06-minimal-A.jpg", colors: ["black", "grey"], formality: "smart", note: "black coat grey trousers" },
  { file: "/heroes/home/07-romantic-A.jpg", colors: ["cream", "beige"], formality: "casual", note: "cream linen" },
  { file: "/heroes/home/08-bold-A.jpg", colors: ["colorful", "black", "grey"], formality: "street", note: "bold cardigan" },
  { file: "/heroes/home/09-street-A.jpg", colors: ["black", "white"], formality: "street", note: "leather jacket" },
  { file: "/heroes/home/09-street-B.jpg", colors: ["black", "white"], formality: "street", note: "leather seated" },
  { file: "/heroes/home/10-sexy-A.jpg", colors: ["black"], formality: "evening", note: "black suit shades" },
  { file: "/heroes/home/10-sexy-B.jpg", colors: ["black"], formality: "evening", note: "black suit mid" },
  { file: "/heroes/home/11-edgy-A.jpg", colors: ["black", "white"], formality: "street", note: "leather edgy" },
  { file: "/heroes/home/11-edgy-B.jpg", colors: ["black", "grey"], formality: "smart", note: "black coat architectural" },
  { file: "/heroes/home/00-default-A.jpg", colors: ["grey", "cream", "navy"], formality: "smart", note: "grey blazer default" },
  { file: "/heroes/home/00-default-C.jpg", colors: ["black"], formality: "casual", note: "turtleneck default" },
  { file: "/heroes/him-casual.jpg", colors: ["brown", "navy"], formality: "smart", note: "leather jacket blue shirt" },
  { file: "/heroes/him-date-night.jpg", colors: ["navy", "white", "brown"], formality: "smart", note: "navy slim suit" },
  { file: "/heroes/him-default.jpg", colors: ["black"], formality: "casual", note: "black turtleneck beanie" },
  { file: "/heroes/him-wedding.jpg", colors: ["navy", "grey", "white"], formality: "formal", note: "blue-grey check suit" },
];

const TAG_TO_FAMILY = {
  Black: "black",
  "Ivory / Cream": "cream",
  White: "white",
  "Grey / Charcoal": "grey",
  "Camel / Tan": "camel",
  Olive: "olive",
  Navy: "navy",
  Burgundy: "burgundy",
  "Forest Green": "green",
  "Sand / Beige": "beige",
  "Rust / Terracotta": "brown",
  "Blush / Dusty Pink": "warm",
  "Bold Color": "colorful",
};

/** Clash pairs — showing A next to an outfit dominated by B is a hard miss. */
const CLASH_PAIRS = [
  ["navy", "grey"],
  ["navy", "olive"],
  ["navy", "camel"],
  ["navy", "beige"],
  ["navy", "cream"],
  ["black", "cream"],
  ["black", "beige"],
  ["olive", "navy"],
  ["olive", "burgundy"],
  ["colorful", "navy"],
];

function hexToRgb(hex) {
  const h = String(hex || "").replace("#", "").trim();
  if (h.length !== 6 && h.length !== 3) return null;
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = Number.parseInt(full, 16);
  if (!Number.isFinite(n)) return null;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function colorFamilyFromHex(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const { r, g, b } = rgb;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const sat = max === 0 ? 0 : (max - min) / max;
  const light = (max + min) / 510;

  if (light < 0.14) return "black";
  if (sat < 0.12) {
    if (light > 0.82) return "cream";
    if (light > 0.55) return "beige";
    return "grey";
  }
  // Hue buckets
  const hue = Math.atan2(Math.sqrt(3) * (g - b), 2 * r - g - b) * (180 / Math.PI);
  const h = (hue + 360) % 360;
  if (h < 25 || h >= 340) return light > 0.45 ? "warm" : "burgundy";
  if (h < 50) return light > 0.45 ? "camel" : "brown";
  if (h < 85) return "olive";
  if (h < 160) return "green";
  if (h < 255) return light < 0.35 ? "navy" : "navy";
  if (h < 310) return "burgundy";
  return "warm";
}

export function colorFamilyFromTag(tag) {
  if (!tag) return null;
  if (TAG_TO_FAMILY[tag]) return TAG_TO_FAMILY[tag];
  const t = String(tag).toLowerCase();
  if (/\bnavy\b/.test(t)) return "navy";
  if (/\bblack\b/.test(t)) return "black";
  if (/\bgrey\b|\bgray\b|\bcharcoal\b/.test(t)) return "grey";
  if (/\bolive\b/.test(t)) return "olive";
  if (/\bcream\b|\bivory\b|\bwhite\b/.test(t)) return "cream";
  if (/\bbeige\b|\bsand\b/.test(t)) return "beige";
  if (/\bcamel\b|\btan\b/.test(t)) return "camel";
  if (/\bbrown\b|\brust\b|\bterra/.test(t)) return "brown";
  if (/\bburgundy\b|\bwine\b/.test(t)) return "burgundy";
  if (/\bgreen\b|\bforest\b/.test(t)) return "green";
  return null;
}

function clashes(a, b) {
  if (!a || !b || a === b) return false;
  return CLASH_PAIRS.some(([x, y]) => (a === x && b === y) || (a === y && b === x));
}

/**
 * Derive color + formality signal from a generated outfit's catalog items.
 */
export function deriveOutfitHeroAttrs({
  items = [],
  catalog = {},
  occasion = null,
  styleFamily = null,
  prompt = "",
} = {}) {
  const colorVotes = new Map();
  const addVote = (family, weight) => {
    if (!family) return;
    colorVotes.set(family, (colorVotes.get(family) || 0) + weight);
  };

  for (const key of items || []) {
    const item = catalog[key];
    if (!item) continue;
    const familyOf = String(item.family || item.type || key || "").toLowerCase();
    const weight = /blazer|suit|outer|coat/.test(familyOf)
      ? 5
      : /shirt|knit|top/.test(familyOf)
        ? 3
        : /trouser|pant/.test(familyOf)
          ? 2
          : 1;
    for (const tag of item.paletteTags || item.colors || []) {
      addVote(colorFamilyFromTag(tag), weight);
    }
    addVote(colorFamilyFromHex(item.color), weight);
    // Name/pattern hints (windowpane grey vs blue)
    const name = String(item.name || "").toLowerCase();
    if (/\bgrey\b|\bgray\b|\bcharcoal\b/.test(name)) addVote("grey", weight + 1);
    if (/\bnavy\b|\bblue\b/.test(name)) addVote("navy", weight + 1);
    if (/\bblack\b/.test(name)) addVote("black", weight + 1);
    if (/\bolive\b|\bgreen\b/.test(name)) addVote("olive", weight);
    if (/\bcream\b|\bivory\b|\beige\b|\blinen\b/.test(name)) addVote("cream", weight);
  }

  const rankedColors = [...colorVotes.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([c]) => c);

  const primaryColor = rankedColors[0] || "grey";
  const secondaryColors = rankedColors.slice(1, 3);

  const tokens = [occasion, styleFamily, prompt].filter(Boolean).join(" ").toLowerCase();
  let formality = "smart";
  if (/\b(wedding|formal|gala|black\s*tie|ceremony)\b/.test(tokens) || occasion === "wedding") {
    formality = "formal";
  } else if (
    /\b(date|dinner|sexy|evening|night\s*out)\b/.test(tokens)
    || styleFamily === "sexy"
    || occasion === "date-night"
  ) {
    formality = "evening";
  } else if (
    /\b(street|edgy|bold)\b/.test(tokens)
    || ["streetwear", "edgy", "bold"].includes(styleFamily)
  ) {
    formality = "street";
  } else if (
    /\b(casual|weekend|relaxed|travel|gym)\b/.test(tokens)
    || styleFamily === "relaxed"
    || occasion === "casual"
  ) {
    formality = "casual";
  }

  return { primaryColor, secondaryColors, formality, rankedColors };
}

function formalityScore(photoF, targetF) {
  if (photoF === targetF) return 30;
  const neighbors = {
    formal: ["smart", "evening"],
    smart: ["formal", "casual", "evening"],
    evening: ["formal", "smart"],
    casual: ["smart", "street"],
    street: ["casual", "evening"],
  };
  if ((neighbors[targetF] || []).includes(photoF)) return 12;
  return 0;
}

/**
 * Score a stock photo against outfit attributes.
 */
export function scoreOutfitHero(photo, attrs) {
  let score = 0;
  const primary = attrs.primaryColor;
  const secondaries = new Set(attrs.secondaryColors || []);
  const photoColors = photo.colors || [];

  if (photoColors.includes(primary)) score += 50;
  for (const c of photoColors) {
    if (secondaries.has(c)) score += 12;
  }

  // Prefer neutral photos when exact color missing
  const photoIsNeutral = photoColors.every((c) => NEUTRAL_COLORS.has(c));
  const hasExact = photoColors.includes(primary);
  if (!hasExact && photoIsNeutral) score += 18;
  if (!hasExact && photoColors.includes("grey") && primary === "grey") score += 40;

  // Clash penalty — the blue-suit-vs-grey-suit failure mode
  for (const c of photoColors) {
    if (clashes(c, primary)) score -= 55;
    for (const s of secondaries) {
      if (clashes(c, s)) score -= 20;
    }
  }
  // Extra: navy-dominant photo vs grey-primary outfit
  if (primary === "grey" && photoColors[0] === "navy") score -= 40;
  if (primary === "navy" && photoColors[0] === "grey" && !photoColors.includes("navy")) score -= 25;

  score += formalityScore(photo.formality, attrs.formality);

  // Slight preference for photos whose lead color is the outfit primary
  if (photoColors[0] === primary) score += 8;

  return score;
}

/**
 * Pick best style-inspiration hero for a generated outfit.
 * @returns {{ src: string, file: string, score: number, attrs: object, photo: object }}
 */
export function pickOutfitHeroPhoto({
  items = [],
  catalog = {},
  occasion = null,
  styleFamily = null,
  prompt = "",
  seed = "",
} = {}) {
  const attrs = deriveOutfitHeroAttrs({ items, catalog, occasion, styleFamily, prompt });
  let best = null;
  let bestScore = -Infinity;

  for (const photo of OUTFIT_HERO_CATALOG) {
    let score = scoreOutfitHero(photo, attrs);
    // Tiny stable tie-break from seed so two similar looks can vary slightly
    if (seed) {
      let h = 0;
      const s = `${seed}:${photo.file}`;
      for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) | 0;
      score += (Math.abs(h) % 5) * 0.01;
    }
    if (score > bestScore) {
      bestScore = score;
      best = photo;
    }
  }

  // Absolute fallback
  const photo = best || OUTFIT_HERO_CATALOG.find((p) => p.file.includes("00-default-A")) || OUTFIT_HERO_CATALOG[0];
  return {
    src: assetUrl(photo.file),
    file: photo.file,
    score: bestScore,
    attrs,
    photo,
  };
}

export { NEUTRAL_COLORS, assetUrl as outfitHeroAssetUrl };
