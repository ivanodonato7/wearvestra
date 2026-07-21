/**
 * Re-infer garment family from product name (and category as a weak hint).
 * Awin / merchant categories are messy — name-first rules prevent jeans-as-shoes.
 */

const JUNK_RE = /\b(socks?|shoelaces?|boot\s*laces?|gloves?|hi[- ]?vis|safety\s*boot|tool|framer|wrench|hammer|womens?|ladies|girls?|maternity|skirt|gown|boys?\b|cologne|perfume|fragrance|aftershave|eau\s*de|body\s*spray|cufflinks?|tie\s*clip|mugs?\b|phone\s*case|luggage\s*tag|smartwatch|timepiece)\b/i;

function isWomensOrNonGarment(name = "") {
  const n = String(name || "");
  if (/\b(womens?|ladies|girl)\b/i.test(n) && !/\bmens?\b/i.test(n)) return true;
  // Standalone "dress" (not dress shirt / dress shoe / dress pant/trouser)
  if (/\bdress\b/i.test(n) && !/\bdress\s*(shirt|shoe|pant|trouser|sock)\b/i.test(n)) return true;
  if (/\b(shoelaces?|boot\s*laces?)\b/i.test(n)) return true;
  return false;
}

/** Ordered most-specific first. Name matches beat category. */
const NAME_RULES = [
  { family: "sunglasses", type: "accessory", re: /\b(sunglass|eyeglasses?|eyewear|optical)\b/i },
  { family: "scarf", type: "accessory", re: /\b(scarf|pocket\s*square|neckerchief)\b/i },
  // Real belts only — not "Belt-Coat" / "Belted Overcoat"
  { family: "belt", type: "accessory", re: /\b(leather\s+)?belts?\b(?!\s*-?\s*coat)(?!ed\b)/i },
  // Tops BEFORE footwear — "oxford shirt" must never become a shoe
  { family: "shirt", type: "shirt", re: /\b(hoodie|sweatshirt|crewneck|t-?shirts?|tees?\b|polo|turtleneck|jumper|sweater|knitwear|henley)\b/i },
  { family: "shirt", type: "shirt", re: /\b(dress\s*shirts?|oxford\s*shirts?|shirts?|blouse)\b/i },
  // Tailoring before jean/denim — "denim suit" is a suit, not trousers
  { family: "blazer", type: "blazer", re: /\b(tuxedo|tux|suits?\b|blazer|sport\s*coat|suit\s*jacket|dinner\s*jacket)\b/i },
  // Active / casual bottoms
  { family: "trouser", type: "trouser", re: /\b(joggers?|sweatpants?|track\s*pants?|gym\s*shorts?|athletic\s*shorts?|boardshorts?)\b/i },
  { family: "trouser", type: "trouser", re: /\b(boot\s*cut\s*jeans?|trousers?|chinos?|jeans?|pants?|cargos?)\b/i },
  // Footwear — require clear shoe words; oxford alone only if not a shirt
  { family: "shoe", type: "shoe", re: /\b(dress\s*shoes?|sneakers?|trainers?|loafer|derby|monk\s*straps?|footwear|wingtip|brogue)\b/i },
  { family: "shoe", type: "shoe", re: /\b(?<!boot\s*cut\s*)(boots?|shoes?)\b/i },
  { family: "shoe", type: "shoe", re: /\boxfords?\b(?!\s*shirts?)/i },
  // Other outerwear
  { family: "blazer", type: "blazer", re: /\b(overcoat|peacoat|topcoat|parka|gilet|waistcoat|vest\b|outerwear|jacket|coat)\b/i },
  // Shorts as trouser only when clearly bottoms
  { family: "trouser", type: "trouser", re: /\b((?:cargo|chino|denim|athletic|gym|swim|board)\s+)?shorts\b/i },
];

function nameLooksLikeFamily(name, family) {
  const n = String(name || "");
  if (family === "shoe") {
    if (/\b(shirt|jean|trouser|chino|pant|hoodie|blazer|suit)\b/i.test(n) && !/\b(shoe|sneaker|trainer|loafer|derby|wingtip|brogue|footwear)\b/i.test(n)) {
      return false;
    }
    if (/\bboot\s*cut\b/i.test(n)) return false;
    if (/\blaces?\b/i.test(n) && !/\b(shoe|boot)\b/i.test(n)) return false;
    return /\b(shoe|boots?|sneaker|trainer|loafer|derby|oxfords?\b(?!\s*shirt)|monk|footwear|wingtip|brogue)\b/i.test(n);
  }
  if (family === "trouser") {
    if (/\b(dress)\b/i.test(n) && !/\b(trousers?|pant|chino|jean|suit)\b/i.test(n)) return false;
    return /\b(trousers?|chinos?|jeans?|pants?|joggers?|sweatpants?|cargos?|shorts?)\b/i.test(n)
      && !/\b(dress\s*shoes?|sneakers?|loafer|derby)\b/i.test(n);
  }
  if (family === "shirt") return /\b(shirt|tee|t-shirt|polo|hoodie|sweater|jumper|turtleneck|knit|sweatshirt)\b/i.test(n) && !/\bsock/i.test(n);
  if (family === "blazer") return /\b(blazer|suit|jacket|coat|tuxedo|tux|sport\s*coat|overcoat|parka)\b/i.test(n);
  if (family === "belt") return /\bbelts?\b/i.test(n) && !/\bbelt(?:ed|-?\s*coat)\b/i.test(n);
  if (family === "scarf") return /\b(scarf|pocket\s*square)\b/i.test(n);
  if (family === "sunglasses") return /\b(sunglass|eyewear|eyeglasses?)\b/i.test(n);
  return false;
}

export function isJunkProduct(item = {}) {
  const blob = [item.name, item.category, item.description].filter(Boolean).join(" ");
  if (JUNK_RE.test(blob)) return true;
  if (isWomensOrNonGarment(item.name || "")) return true;
  if (/\bwomens?\b/i.test(blob) && !/\bmens?\b/i.test(blob)) return true;
  // Non-apparel enrichment / merchant categories
  const corrected = String(item.enrichment?.categoryCorrected || item.categoryCorrected || "").toLowerCase();
  if (corrected === "other") return true;
  const cat = String(item.category || "");
  if (/\b(bags?|watches?)\b/i.test(cat)) return true;
  if (/^novelty/i.test(cat) && /\bmugs?\b/i.test(item.name || "")) return true;
  if (/\bmugs?\.\s*$/i.test(item.name || "") || /\bmugs?\b/i.test(item.name || "")) return true;
  return false;
}

export function inferFamilyFromText(name = "", category = "") {
  const nameBlob = String(name || "");
  for (const rule of NAME_RULES) {
    if (rule.re.test(nameBlob)) {
      // Avoid "short sleeve shirt" → trouser via shorts rule (shorts rule is last)
      if (rule.family === "trouser" && /\bshort\s*sleeve\b/i.test(nameBlob) && !/\bshorts\b/i.test(nameBlob)) {
        continue;
      }
      // "short suit" / "size 46 short" is a suit cut, not shorts
      if (rule.family === "trouser" && /\bshort\b/i.test(nameBlob) && /\b(suit|blazer|coat)\b/i.test(nameBlob) && !/\bshorts\b/i.test(nameBlob)) {
        continue;
      }
      return { family: rule.family, type: rule.type };
    }
  }
  const cat = String(category || "");
  if (cat) {
    for (const rule of NAME_RULES) {
      if (rule.re.test(cat)) return { family: rule.family, type: rule.type };
    }
  }
  return null;
}

/**
 * Return item with corrected family/type, or null if junk / unclassifiable.
 */
export function reclassifyItem(item) {
  if (!item) return null;
  if (isJunkProduct(item)) return null;
  const inferred = inferFamilyFromText(item.name, item.category);
  if (!inferred) {
    // Keep original only if name still looks coherent with declared family
    if (item.family && nameLooksLikeFamily(item.name, item.family)) {
      return item;
    }
    return null;
  }
  // If declared family already matches name, keep it
  if (item.family && nameLooksLikeFamily(item.name, item.family) && item.family === inferred.family) {
    return item;
  }
  return {
    ...item,
    family: inferred.family,
    type: inferred.type === "accessory" ? "accessory" : inferred.family,
  };
}

/** Soft check used by pickers — shoe slot must look like footwear, etc. */
export function familyCoherent(item, family) {
  if (!item || !family) return false;
  if (item.family !== family) return false;
  return nameLooksLikeFamily(item.name, family) || !item.name;
}
