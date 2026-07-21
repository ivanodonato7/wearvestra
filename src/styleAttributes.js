/**
 * Derive stylist-usable attributes from messy Awin product text.
 * Merchant category/description are unreliable — name + inferred tags do the work.
 */

const NEUTRAL_TAGS = new Set([
  "Black",
  "White",
  "Ivory / Cream",
  "Grey / Charcoal",
  "Navy",
  "Camel / Tan",
  "Sand / Beige",
]);

const COLOR_WORDS = [
  { re: /\b(black|noir)\b/i, tag: "Black" },
  { re: /\b(navy|midnight)\b/i, tag: "Navy" },
  { re: /\b(charcoal|grey|gray|slate)\b/i, tag: "Grey / Charcoal" },
  { re: /\b(white|ivory|cream|off[\s-]?white)\b/i, tag: "Ivory / Cream" },
  { re: /\b(camel|tan|cognac|brown|chocolate|chestnut)\b/i, tag: "Camel / Tan" },
  { re: /\b(beige|sand|khaki|stone|taupe)\b/i, tag: "Sand / Beige" },
  { re: /\b(olive|army)\b/i, tag: "Olive" },
  { re: /\b(burgundy|wine|oxblood|maroon)\b/i, tag: "Burgundy" },
  { re: /\b(rust|terracotta|cognac)\b/i, tag: "Rust / Terracotta" },
  { re: /\b(forest|hunter)\b/i, tag: "Forest Green" },
  { re: /\b(red|scarlet|crimson)\b/i, tag: "Bold Color" },
  { re: /\b(blue|cobalt|royal|azure)\b/i, tag: "Navy" },
  { re: /\b(green|emerald|mint)\b/i, tag: "Forest Green" },
  { re: /\b(pink|coral|mauve|lilac)\b/i, tag: "Bold Color" },
  { re: /\b(yellow|gold|mustard)\b/i, tag: "Bold Color" },
  { re: /\b(orange|tangerine)\b/i, tag: "Rust / Terracotta" },
  { re: /\b(purple|violet)\b/i, tag: "Bold Color" },
];

const FITTED_RE = /\b(slim|skinny|fitted|tailored|tapered|narrow|close[\s-]?fit|athletic\s*fit|muscle)\b/i;
const RELAXED_RE = /\b(relaxed|loose|wide|oversized|baggy|boxy|roomy|boot\s*cut|flare|easy\s*fit|regular\s*fit|classic\s*fit|straight)\b/i;

export function isNeutralTag(tag) {
  return NEUTRAL_TAGS.has(tag);
}

export function extractColorTags(item = {}) {
  const existing = Array.isArray(item.paletteTags) ? item.paletteTags.filter(Boolean) : [];
  if (existing.length) return [...new Set(existing)].slice(0, 3);
  const text = [item.name, item.searchQuery, item.category].filter(Boolean).join(" ");
  const tags = [];
  for (const row of COLOR_WORDS) {
    if (row.re.test(text)) tags.push(row.tag);
  }
  return [...new Set(tags)].slice(0, 3);
}

/** fitted | relaxed | straight — inferred; Awin does not ship a clean cut field. */
export function inferCut(item = {}) {
  const text = [item.name, item.searchQuery, item.searchNoun].filter(Boolean).join(" ");
  const fam = item.family || item.type;
  if (FITTED_RE.test(text) && !/\bregular\s*fit|classic\s*fit\b/i.test(text)) return "fitted";
  if (/\b(wide|oversized|baggy|boxy|loose|boot\s*cut|flare)\b/i.test(text)) return "relaxed";
  if (RELAXED_RE.test(text)) return "straight";
  // Family defaults when name is silent
  if (fam === "blazer") return "fitted";
  if (fam === "shoe") return "straight";
  if (fam === "trouser" && /\b(chino|dress|suit|wool)\b/i.test(text)) return "fitted";
  if (fam === "shirt" && /\b(hoodie|sweat|tee|t-shirt)\b/i.test(text)) return "relaxed";
  return "straight";
}

export function enrichStyleAttributes(item) {
  if (!item) return item;
  const colors = extractColorTags(item);
  const cut = inferCut(item);
  const neutrals = colors.filter(isNeutralTag);
  const accents = colors.filter((c) => !isNeutralTag(c));
  return {
    ...item,
    colors,
    cut,
    isNeutral: accents.length === 0 && colors.length > 0,
    accentColors: accents,
    neutralColors: neutrals,
  };
}

/** Shared palette tags across an outfit — one primary color per garment (names list many). */
export function outfitColorStats(items = []) {
  const primaries = [];
  for (const item of items) {
    const tags = extractColorTags(item);
    if (tags[0]) primaries.push(tags[0]);
  }
  const unique = [...new Set(primaries)];
  const accents = unique.filter((c) => !isNeutralTag(c));
  const neutrals = unique.filter(isNeutralTag);
  return { colors: unique, accents, neutrals, accentCount: accents.length, colorCount: unique.length };
}

export function cutsBalance(items = {}) {
  const top = items.shirt || items.blazer;
  const bottom = items.trouser;
  if (!top || !bottom) return { ok: true, reason: "incomplete" };
  const topCut = top.cut || inferCut(top);
  const bottomCut = bottom.cut || inferCut(bottom);
  if (topCut === "fitted" && bottomCut === "fitted") {
    return { ok: false, reason: "all-fitted", topCut, bottomCut };
  }
  if (topCut === "relaxed" && bottomCut === "relaxed") {
    return { ok: false, reason: "all-loose", topCut, bottomCut };
  }
  return { ok: true, topCut, bottomCut };
}

/**
 * One-line "why this works" from the actual pieces — used by local composer
 * and as a fallback if the model omits rationale.
 */
export function buildWhyThisWorks(items = [], prompt = "", occasions = []) {
  const list = items.filter(Boolean);
  if (list.length < 2) return "A simple, wearable combination.";
  const byFam = {};
  for (const it of list) {
    const fam = it.family || it.type;
    if (fam) byFam[fam] = it;
  }
  const stats = outfitColorStats(list);
  const occasion = occasions[0] || "everyday";
  const blazer = byFam.blazer;
  const shirt = byFam.shirt;
  const trouser = byFam.trouser;
  const shoe = byFam.shoe;

  const colorBit = (() => {
    if (stats.accents.length === 1 && stats.neutrals.length) {
      return `${stats.accents[0].split(" / ")[0]} stays the only bold note, grounded by ${stats.neutrals[0].split(" / ")[0].toLowerCase()}`;
    }
    if (stats.neutrals.length >= 2) {
      return `${stats.neutrals.slice(0, 2).map((c) => c.split(" / ")[0].toLowerCase()).join(" + ")} keep the palette quiet`;
    }
    if (stats.colors[0]) return `${stats.colors[0].split(" / ")[0]} sets a clear color story`;
    return "neutrals keep the look calm";
  })();

  const formalBit = (() => {
    if (occasion === "wedding" || occasion === "funeral" || occasion === "event") {
      if (blazer) return `${shortName(blazer)} holds the formality`;
      return "tailored pieces hold the formality";
    }
    if (occasion === "active") {
      return `${shortName(shirt || list[0])} + ${shortName(shoe || list[list.length - 1])} stay gym-ready`;
    }
    if (occasion === "work") {
      return blazer
        ? `${shortName(blazer)} reads interview-sharp`
        : `${shortName(shirt || list[0])} keeps it office-clean`;
    }
    if (occasion === "dinner") {
      return blazer
        ? `${shortName(blazer)} lifts it for a first date`
        : `${shortName(shirt || list[0])} keeps date night intentional`;
    }
    return `${shortName(shirt || list[0])} keeps weekend casual easy`;
  })();

  const balance = cutsBalance(byFam);
  const cutBit = (() => {
    if (!balance.ok) return null;
    if (balance.topCut === "fitted" && balance.bottomCut === "relaxed") {
      return "fitted top against a easier bottom";
    }
    if (balance.topCut === "relaxed" && balance.bottomCut === "fitted") {
      return "relaxed top balanced by cleaner trousers";
    }
    if (trouser && shoe) return `${shortName(shoe)} finishes the line`;
    return null;
  })();

  const parts = [formalBit, colorBit];
  if (cutBit) parts.push(cutBit);
  // One sentence, max ~160 chars
  let line = parts.filter(Boolean).join("; ") + ".";
  if (line.length > 170) line = `${formalBit}; ${colorBit}.`;
  return line.charAt(0).toUpperCase() + line.slice(1);
}

function shortName(item) {
  if (!item) return "this piece";
  const colors = extractColorTags(item);
  const color = colors[0] ? colors[0].split(" / ")[0] : null;
  const fam = item.family || item.type || "piece";
  const noun = {
    blazer: /\b(suits?|tuxedo|tux)\b/i.test(item.name || "") ? "suit" : "blazer",
    shirt: /\b(hoodie|sweat)\b/i.test(item.name || "") ? "hoodie" : /\bturtleneck|jumper|sweater\b/i.test(item.name || "") ? "knit" : "shirt",
    trouser: /\b(short)\b/i.test(item.name || "") ? "shorts" : /\bchino\b/i.test(item.name || "") ? "chinos" : "trousers",
    shoe: /\b(sneaker|trainer)\b/i.test(item.name || "") ? "sneakers" : "shoes",
    belt: "belt",
    scarf: "scarf",
    sunglasses: "sunglasses",
  }[fam] || "piece";
  return color ? `${color.toLowerCase()} ${noun}` : noun;
}

export { NEUTRAL_TAGS };
