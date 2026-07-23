/**
 * Outfit "Style inspiration" hero picker.
 * Chooses a curated stock photo from /public/heroes based on the generated
 * look's garment colors + pattern + formality — not archetype/occasion alone.
 *
 * Preference: outer garment color/pattern → formality → neutral same-formality
 * over any color clash (e.g. never a black suit photo next to a grey windowpane look).
 */

const ASSET_V = "outfithero3";
const assetUrl = (path) => `${path}?v=${ASSET_V}`;

/** Neutral families — safe when an exact color match is missing. */
const NEUTRAL_COLORS = new Set(["black", "grey", "cream", "beige", "white", "camel", "brown"]);

/** Colors that count as the same family for matching. */
const COLOR_ALIASES = {
  green: ["green", "olive"],
  olive: ["olive", "green"],
  grey: ["grey"],
  navy: ["navy"],
  black: ["black"],
  cream: ["cream", "beige", "white"],
  beige: ["beige", "cream", "camel"],
  camel: ["camel", "beige", "brown"],
  brown: ["brown", "camel"],
  burgundy: ["burgundy", "warm"],
  warm: ["warm", "burgundy"],
  colorful: ["colorful"],
  white: ["white", "cream"],
};

/**
 * Curated stock set with color + pattern + formality tags.
 */
export const OUTFIT_HERO_CATALOG = [
  { file: "/heroes/home/01-quiet-A.jpg", colors: ["olive", "green", "white"], patterns: ["solid", "velvet"], formality: "smart", note: "olive/green suit" },
  { file: "/heroes/home/01-quiet-B.jpg", colors: ["navy", "white", "cream"], patterns: ["solid"], formality: "formal", note: "navy blazer cream trousers" },
  { file: "/heroes/home/01-quiet-C.jpg", colors: ["navy", "white"], patterns: ["solid"], formality: "formal", note: "navy suit tie" },
  { file: "/heroes/home/02-relaxed-A.jpg", colors: ["grey", "cream", "navy"], patterns: ["solid"], formality: "smart", note: "grey blazer cream trousers" },
  { file: "/heroes/home/02-relaxed-B.jpg", colors: ["grey", "cream"], patterns: ["solid"], formality: "smart", note: "grey smart casual" },
  { file: "/heroes/home/03-modern-A.jpg", colors: ["black"], patterns: ["solid"], formality: "smart", note: "all-black modern" },
  { file: "/heroes/home/03-modern-B.jpg", colors: ["black"], patterns: ["solid"], formality: "evening", note: "black suit evening" },
  { file: "/heroes/home/03-modern-C.jpg", colors: ["black"], patterns: ["solid"], formality: "evening", note: "black suit crop" },
  { file: "/heroes/home/04-warm-A.jpg", colors: ["camel", "beige", "brown"], patterns: ["solid"], formality: "smart", note: "camel coat knit" },
  { file: "/heroes/home/04-warm-C.jpg", colors: ["black"], patterns: ["solid"], formality: "casual", note: "black turtleneck" },
  { file: "/heroes/home/05-classic-A.jpg", colors: ["navy", "white", "cream"], patterns: ["solid"], formality: "formal", note: "navy blazer classic" },
  { file: "/heroes/home/05-classic-B.jpg", colors: ["navy", "grey"], patterns: ["solid"], formality: "formal", note: "navy classic B" },
  { file: "/heroes/home/05-classic-C.jpg", colors: ["navy", "white", "brown"], patterns: ["solid"], formality: "smart", note: "navy suit brown shoes" },
  { file: "/heroes/home/06-minimal-A.jpg", colors: ["grey", "black"], patterns: ["solid"], formality: "smart", note: "grey/black coat trousers" },
  { file: "/heroes/home/06-minimal-B.jpg", colors: ["grey", "black"], patterns: ["solid"], formality: "smart", note: "minimal grey B" },
  { file: "/heroes/home/06-minimal-C.jpg", colors: ["grey", "cream"], patterns: ["solid"], formality: "smart", note: "minimal grey C" },
  { file: "/heroes/home/07-romantic-A.jpg", colors: ["cream", "beige"], patterns: ["solid"], formality: "casual", note: "cream linen" },
  { file: "/heroes/home/08-bold-A.jpg", colors: ["colorful", "black", "grey"], patterns: ["patterned", "plaid"], formality: "street", note: "bold patterned cardigan" },
  { file: "/heroes/home/08-bold-B.jpg", colors: ["colorful"], patterns: ["patterned"], formality: "street", note: "bold B" },
  { file: "/heroes/home/09-street-A.jpg", colors: ["black", "white"], patterns: ["solid"], formality: "street", note: "leather jacket" },
  { file: "/heroes/home/09-street-B.jpg", colors: ["black", "white"], patterns: ["solid"], formality: "street", note: "leather seated" },
  { file: "/heroes/home/10-sexy-A.jpg", colors: ["black"], patterns: ["solid"], formality: "evening", note: "black suit shades" },
  { file: "/heroes/home/10-sexy-B.jpg", colors: ["black"], patterns: ["solid"], formality: "evening", note: "black suit mid" },
  { file: "/heroes/home/11-edgy-A.jpg", colors: ["black", "white"], patterns: ["solid"], formality: "street", note: "leather edgy" },
  { file: "/heroes/home/11-edgy-B.jpg", colors: ["black", "grey"], patterns: ["solid"], formality: "smart", note: "black coat architectural" },
  { file: "/heroes/home/00-default-A.jpg", colors: ["grey", "cream"], patterns: ["solid"], formality: "smart", note: "grey blazer default" },
  { file: "/heroes/home/00-default-B.jpg", colors: ["grey", "navy"], patterns: ["solid"], formality: "smart", note: "grey default B" },
  { file: "/heroes/home/00-default-C.jpg", colors: ["black"], patterns: ["solid"], formality: "casual", note: "turtleneck default" },
  { file: "/heroes/him-casual.jpg", colors: ["brown", "navy"], patterns: ["solid"], formality: "smart", note: "leather jacket blue shirt" },
  { file: "/heroes/him-date-night.jpg", colors: ["navy", "white", "brown"], patterns: ["solid"], formality: "smart", note: "navy slim suit" },
  { file: "/heroes/him-default.jpg", colors: ["black"], patterns: ["solid"], formality: "casual", note: "black turtleneck beanie" },
  { file: "/heroes/him-wedding.jpg", colors: ["navy", "grey", "white"], patterns: ["check", "plaid"], formality: "formal", note: "blue-grey check suit" },
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
  // Accent only — never drives primary hero color
  "Bold Color": null,
};

/** Clash pairs — showing A next to an outfit dominated by B is a hard miss. */
const CLASH_PAIRS = [
  ["navy", "grey"],
  ["navy", "olive"],
  ["navy", "green"],
  ["navy", "camel"],
  ["navy", "beige"],
  ["navy", "cream"],
  ["black", "cream"],
  ["black", "beige"],
  ["black", "green"],
  ["black", "olive"],
  // black↔grey is NOT a hard clash when grey is also in the photo (handled via lead-color penalty)
  ["olive", "navy"],
  ["green", "navy"],
  ["olive", "burgundy"],
  ["colorful", "navy"],
  ["colorful", "grey"],
  ["colorful", "green"],
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
  const hue = Math.atan2(Math.sqrt(3) * (g - b), 2 * r - g - b) * (180 / Math.PI);
  const h = (hue + 360) % 360;
  if (h < 25 || h >= 340) return light > 0.45 ? "warm" : "burgundy";
  if (h < 50) return light > 0.45 ? "camel" : "brown";
  if (h < 85) return "olive";
  if (h < 160) return "green";
  if (h < 255) return "navy";
  if (h < 310) return "burgundy";
  return "warm";
}

export function colorFamilyFromTag(tag) {
  if (!tag) return null;
  if (Object.prototype.hasOwnProperty.call(TAG_TO_FAMILY, tag)) return TAG_TO_FAMILY[tag];
  const t = String(tag).toLowerCase();
  if (/\bnavy\b/.test(t)) return "navy";
  if (/\bblack\b/.test(t)) return "black";
  if (/\bgrey\b|\bgray\b|\bcharcoal\b/.test(t)) return "grey";
  if (/\bolive\b/.test(t)) return "olive";
  if (/\bgreen\b|\bforest\b/.test(t)) return "green";
  if (/\bcream\b|\bivory\b|\bwhite\b/.test(t)) return "cream";
  if (/\bbeige\b|\bsand\b/.test(t)) return "beige";
  if (/\bcamel\b|\btan\b/.test(t)) return "camel";
  if (/\bbrown\b|\brust\b|\bterra/.test(t)) return "brown";
  if (/\bburgundy\b|\bwine\b/.test(t)) return "burgundy";
  if (/\bbold\b/.test(t)) return null; // accent only
  return null;
}

function detectPattern(text = "") {
  const t = String(text).toLowerCase();
  if (/\bwindowpane\b/.test(t)) return "windowpane";
  if (/\bplaid\b|\btartan\b/.test(t)) return "plaid";
  if (/\bcheck(?:ed|s)?\b|\bgingham\b/.test(t)) return "check";
  if (/\bstripe|pinstripe|chalkstripe\b/.test(t)) return "stripe";
  if (/\bvelvet\b/.test(t)) return "velvet";
  if (/\bhoundstooth|herringbone|tweed\b/.test(t)) return "textured";
  if (/\bpattern|print|floral|graphic\b/.test(t)) return "patterned";
  return "solid";
}

function colorsMatch(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  const aliases = COLOR_ALIASES[a] || [a];
  return aliases.includes(b);
}

function clashes(a, b) {
  if (!a || !b || colorsMatch(a, b)) return false;
  return CLASH_PAIRS.some(([x, y]) => (
    (colorsMatch(a, x) && colorsMatch(b, y))
    || (colorsMatch(a, y) && colorsMatch(b, x))
  ));
}

function patternCompatible(photoPatterns = [], outfitPattern) {
  if (!outfitPattern || outfitPattern === "solid") {
    // Solid outfits: prefer solid photos; patterned is a miss
    if ((photoPatterns || []).includes("solid") || !(photoPatterns || []).length) return 8;
    if ((photoPatterns || []).some((p) => ["plaid", "check", "patterned", "windowpane"].includes(p))) return -35;
    return 0;
  }
  // Patterned outfits: prefer related patterns, never require exact stock
  if ((photoPatterns || []).includes(outfitPattern)) return 28;
  if (outfitPattern === "windowpane" || outfitPattern === "plaid" || outfitPattern === "check") {
    if ((photoPatterns || []).some((p) => ["plaid", "check", "windowpane", "solid"].includes(p))) {
      // solid grey is OK for grey windowpane; loud patterned cardigan is not
      if ((photoPatterns || []).includes("solid")) return 10;
      return 18;
    }
  }
  if (outfitPattern === "velvet") {
    if ((photoPatterns || []).includes("velvet") || (photoPatterns || []).includes("solid")) return 14;
  }
  if ((photoPatterns || []).includes("patterned") && outfitPattern !== "patterned") return -40;
  return 0;
}

/**
 * Derive color + pattern + formality from the actual outfit garments.
 * Outer (blazer/suit) dominates primary color.
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

  let outfitPattern = "solid";
  let outerPattern = null;

  for (const key of items || []) {
    const item = catalog[key];
    if (!item) continue;
    const familyOf = String(item.family || item.type || key || "").toLowerCase();
    const isOuter = /blazer|suit|outer|coat/.test(familyOf);
    const isTop = /shirt|knit|top/.test(familyOf);
    const isBottom = /trouser|pant/.test(familyOf);
    // Outer dominates — this fixes grey suit vs black photo / green blazer vs cream linen
    const weight = isOuter ? 14 : isTop ? 2 : isBottom ? 3 : 1;

    for (const tag of item.paletteTags || item.colors || []) {
      addVote(colorFamilyFromTag(tag), weight);
    }
    // Hex on many Awin rows is a useless mid-grey placeholder — only trust it lightly
    const hexFam = colorFamilyFromHex(item.color);
    if (hexFam && hexFam !== "grey") addVote(hexFam, Math.max(1, Math.floor(weight / 3)));

    const name = String(item.name || "").toLowerCase();
    if (/\bgrey\b|\bgray\b|\bcharcoal\b/.test(name)) addVote("grey", weight + 2);
    if (/\bnavy\b/.test(name)) addVote("navy", weight + 2);
    if (/\bblue\b/.test(name) && !/\bnavy\b/.test(name)) addVote("navy", weight);
    if (/\bblack\b/.test(name)) addVote("black", weight + 1);
    if (/\bolive\b/.test(name)) addVote("olive", weight + 2);
    if (/\bgreen\b|\bforest\b|\bemerald\b/.test(name)) addVote("green", weight + 2);
    if (/\bvelvet\b/.test(name) && /\bgreen\b|\bolive\b/.test(name)) addVote("green", weight + 3);
    if (/\bcream\b|\bivory\b|\blinen\b/.test(name) && !isOuter) addVote("cream", weight);
    if (/\bbeige\b|\bkhaki\b|\btan\b|\bsand\b/.test(name) && !isOuter) addVote("beige", weight);
    if (/\bcamel\b/.test(name)) addVote("camel", weight + 1);
    if (/\bbrown\b/.test(name)) addVote("brown", weight);

    const pat = detectPattern(name);
    if (isOuter && pat !== "solid") {
      outerPattern = pat;
      outfitPattern = pat;
    } else if (!outerPattern && pat !== "solid" && (isTop || isBottom)) {
      outfitPattern = pat;
    }
  }

  const rankedColors = [...colorVotes.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([c]) => c);

  const primaryColor = rankedColors[0] || "grey";
  const secondaryColors = rankedColors.slice(1, 3);

  const tokens = [occasion, styleFamily, prompt].filter(Boolean).join(" ").toLowerCase();
  let formality = "smart";
  if (/\b(wedding|formal|gala|black\s*tie|ceremony|funeral)\b/.test(tokens) || occasion === "wedding") {
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

  return { primaryColor, secondaryColors, formality, rankedColors, pattern: outfitPattern };
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
  if ((neighbors[targetF] || []).includes(photoF)) return 10;
  return -8;
}

/**
 * Score a stock photo against outfit attributes.
 */
export function scoreOutfitHero(photo, attrs) {
  let score = 0;
  const primary = attrs.primaryColor;
  const secondaries = new Set(attrs.secondaryColors || []);
  const photoColors = photo.colors || [];
  const photoLead = photoColors[0];

  // Exact / alias color match on photo colors
  for (const c of photoColors) {
    if (colorsMatch(c, primary)) score += c === photoLead ? 60 : 45;
  }
  for (const c of photoColors) {
    for (const s of secondaries) {
      if (colorsMatch(c, s)) score += 10;
    }
  }

  // Prefer neutral photos when exact color missing — but not a clashing lead color
  const hasExact = photoColors.some((c) => colorsMatch(c, primary));
  const photoIsNeutral = photoColors.every((c) => NEUTRAL_COLORS.has(c));
  if (!hasExact && photoIsNeutral && !clashes(photoLead, primary)) score += 16;

  // Clash penalty — lead color vs outfit primary (ignore secondary photo neutrals)
  if (photoLead && clashes(photoLead, primary)) score -= 70;
  // Secondary photo colors that clash with primary (milder)
  for (const c of photoColors.slice(1)) {
    if (clashes(c, primary)) score -= 15;
  }
  for (const c of photoColors) {
    for (const s of secondaries) {
      if (clashes(c, s)) score -= 8;
    }
  }
  // Extra: black-only / black-lead photo when outfit primary is not black
  if (photoLead === "black" && primary !== "black") score -= 50;
  // Colorful/patterned street photo when outfit is not colorful
  if (photoColors.includes("colorful") && primary !== "colorful") score -= 55;
  if ((photo.formality === "street" || (photo.patterns || []).includes("patterned"))
    && attrs.formality !== "street"
    && primary !== "colorful") {
    score -= 30;
  }

  score += formalityScore(photo.formality, attrs.formality);
  score += patternCompatible(photo.patterns, attrs.pattern);

  // Prefer lead color === primary
  if (photoLead && colorsMatch(photoLead, primary)) score += 12;

  // Active/casual looks should not pick black-tie / wedding check photos
  if ((attrs.formality === "casual" || attrs.formality === "street") && photo.formality === "formal") {
    score -= 35;
  }

  return score;
}

/**
 * Pick best style-inspiration hero for a generated outfit.
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
