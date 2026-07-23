/**
 * Coordinate full outfits (formality + color + silhouette), not independent picks.
 * Used by the local composer and offline tests when Claude is unavailable.
 */
import { CATALOG, liveCatalogItems, pickLiveForFamily, occasionFormalityTarget, itemFitsOccasion } from "./catalogStore.js";
import { detectOccasions } from "./occasions.js";
import {
  buildWhyThisWorks,
  cutsBalance,
  extractColorTags,
  isNeutralTag,
  outfitColorStats,
} from "./styleAttributes.js";
import {
  apparelEligible,
  isFullSuitProduct,
  validateLookShape,
  enforceOnePerCategory,
  fillMissingCoreSlots,
  REQUIRED_FLOOR_FAMILIES,
  BONUS_ACCESSORY_FAMILIES,
} from "./outfitAssembly.js";

const FORMAL_OCCASIONS = new Set(["wedding", "funeral", "event", "work"]);
const ACTIVE_OCCASIONS = new Set(["active"]);

function templatesFor(occasions) {
  const o = new Set(occasions || []);
  // Floor always: shirt + trouser + shoe + belt. Blazer/sunglasses are optional extras.
  if (o.has("active")) {
    return [
      ["shirt", "trouser", "shoe", "belt"],
      ["shirt", "trouser", "shoe", "belt"],
      ["shirt", "trouser", "shoe", "belt"],
    ];
  }
  if (o.has("wedding") || o.has("funeral") || o.has("event")) {
    return [
      ["blazer", "shirt", "trouser", "shoe", "belt"],
      ["blazer", "shirt", "trouser", "shoe", "belt"],
      ["blazer", "shirt", "trouser", "shoe", "belt"],
    ];
  }
  if (o.has("work")) {
    return [
      ["blazer", "shirt", "trouser", "shoe", "belt"],
      ["blazer", "shirt", "trouser", "shoe", "belt"],
      ["shirt", "trouser", "shoe", "belt"],
    ];
  }
  if (o.has("dinner") || o.has("sexy")) {
    return [
      ["blazer", "shirt", "trouser", "shoe", "belt"],
      ["shirt", "trouser", "shoe", "belt"],
      ["blazer", "shirt", "trouser", "shoe", "belt", "sunglasses"],
    ];
  }
  return [
    ["shirt", "trouser", "shoe", "belt"],
    ["shirt", "trouser", "shoe", "belt", "sunglasses"],
    ["blazer", "shirt", "trouser", "shoe", "belt"],
  ];
}

function colorCompatible(item, anchorColors, allowAccent) {
  const tags = extractColorTags(item);
  if (!tags.length) return 4; // unknown — soft pass
  if (!anchorColors.length) return 10;
  let score = 0;
  for (const t of tags) {
    if (anchorColors.includes(t)) score += 20;
    else if (isNeutralTag(t)) score += 12;
    else if (allowAccent) score += 2;
    else score -= 25;
  }
  return score;
}

function scoreCandidate(item, {
  target,
  anchorColors,
  allowAccent,
  preferCut,
  avoidCut,
  usedKeys,
  family,
  occasions,
}) {
  if (!item || usedKeys.has(item.key)) return -Infinity;
  if (!apparelEligible(item)) return -Infinity;
  const fit = itemFitsOccasion(item, target);
  if (!fit.ok && fit.score < -100) return -Infinity;
  let s = fit.score;
  s += colorCompatible(item, anchorColors, allowAccent);
  const cut = item.cut || "straight";
  if (preferCut && cut === preferCut) s += 14;
  if (avoidCut && cut === avoidCut) s -= 18;
  const name = String(item.name || "");
  const formalish = target.label?.startsWith("formal") || target.label === "smart" || target.label === "smart-evening";
  if (formalish) {
    if (item.isNeutral || extractColorTags(item).every(isNeutralTag)) s += 8;
    if (family === "blazer" && /\b(blazer|suit|sport\s*coat|tuxedo)\b/i.test(name)) s += 25;
    if (family === "blazer" && /\b(fleece|synchilla|track|puffer|hoodie|rain)\b/i.test(name)) s -= 60;
    if (family === "shirt" && /\bdress\s*shirt\b/i.test(name)) s += 22;
    if (family === "shirt" && /\b(walking\s*suit|graphic|novelty|hoodie|tee)\b/i.test(name)) s -= 40;
    if (family === "trouser" && /\b(chino|dress|wool|trouser|pant)\b/i.test(name)) s += 12;
    if (family === "trouser" && isFullSuitProduct(item)) s -= 90;
    if (family === "shoe" && /\b(dress\s*shoe|oxford|derby|loafer|wingtip)\b/i.test(name)) s += 18;
    if (target.preferDark) {
      if (/\b(black|charcoal|navy)\b/i.test(name)) s += 20;
      if (/\b(coral|pink|mint|mauve|red|lilac|bright)\b/i.test(name)) s -= 50;
    }
  }
  if (target.label === "active" || occasions?.includes("active")) {
    if (/\b(gym|athletic|sport|hoodie|jogger|sweat|sneaker|trainer|short)\b/i.test(name)) s += 30;
    if (/\b(holster|safety|work\s*trouser|brogue|dress\s*shoe|blazer)\b/i.test(name)) s -= 70;
    if (family === "shoe" && !/\b(sneaker|trainer|runner)\b/i.test(name)) s -= 40;
  }
  return s;
}

function pickCoordinated(family, ctx) {
  const relax = Boolean(ctx.relax);
  const pool = liveCatalogItems().filter((i) => i.family === family && !ctx.usedKeys.has(i.key));
  let best = null;
  let bestScore = -Infinity;
  for (const item of pool) {
    const s = scoreCandidate(item, { ...ctx, family });
    if (s > bestScore) {
      bestScore = s;
      best = item;
    }
  }
  // Required floor: accept a weaker match rather than drop the category
  const isRequired = REQUIRED_FLOOR_FAMILIES.includes(family) || (ctx.requireOuter && family === "blazer");
  const threshold = relax || isRequired ? -200 : -50;
  if (best && bestScore > threshold) return best;
  return pickLiveForFamily(family, {
    prompt: ctx.prompt,
    occasions: ctx.occasions,
    palette: ctx.palette,
    avoid: ctx.avoid,
    usedKeys: ctx.usedKeys,
  });
}

function validateOutfit(items, target, occasions) {
  if (!items.length || items.length < 4) return { ok: false, reason: "too-few" };
  const requireOuter = Boolean(target?.requireOuter);
  const shape = validateLookShape(items, { requireFloor: true, requireOuter });
  if (!shape.ok) return shape;
  const formalities = items.map((i) => i.formality ?? 50);
  const spread = Math.max(...formalities) - Math.min(...formalities);
  // Hard: no wild formality mix (cargo + blazer)
  if (spread > 55 && !ACTIVE_OCCASIONS.has(occasions[0])) {
    return { ok: false, reason: `formality-spread-${spread}` };
  }
  for (const item of items) {
    if (!apparelEligible(item)) return { ok: false, reason: "non-apparel" };
    const fit = itemFitsOccasion(item, target);
    if (fit.reason === "hardBan") return { ok: false, reason: `ban:${item.name}` };
  }
  const stats = outfitColorStats(items);
  // Allow several neutrals; block multiple loud accents
  if (stats.accentCount > 1) return { ok: false, reason: "too-many-accents" };
  if (stats.accentCount + Math.min(stats.neutrals.length, 3) > 4 && stats.accentCount > 0) {
    return { ok: false, reason: "too-many-colors" };
  }

  const byFam = {};
  for (const it of items) byFam[it.family] = it;
  const formalish = FORMAL_OCCASIONS.has(occasions[0])
    || occasions.includes("wedding")
    || occasions.includes("funeral")
    || occasions.includes("work");
  // Suits are often all-fitted — allow that for formal/work. Still block all-loose.
  if (!ACTIVE_OCCASIONS.has(occasions[0]) && !occasions.includes("street")) {
    const bal = cutsBalance(byFam);
    if (!bal.ok && !(formalish && bal.reason === "all-fitted")) {
      return { ok: false, reason: bal.reason };
    }
  }
  if (formalish) {
    const blob = items.map((i) => i.name).join(" ");
    if (/\b(cargo|sneaker|trainer|hoodie|jogger|gym|fleece|synchilla|holster|walking\s*suit)\b/i.test(blob)) {
      return { ok: false, reason: "casual-in-formal" };
    }
  }
  if (ACTIVE_OCCASIONS.has(occasions[0])) {
    const blob = items.map((i) => i.name).join(" ");
    if (/\b(holster|safety|steel\s*toe|brogue|blazer|suit\b|dress\s*shoe)\b/i.test(blob)) {
      return { ok: false, reason: "wrong-for-gym" };
    }
  }
  return { ok: true, stats };
}

/**
 * Build N coordinated outfits for a prompt.
 */
export function composeCoordinatedOutfits(prompt, profile = {}, count = 3) {
  const occasions = detectOccasions(prompt);
  const target = occasionFormalityTarget(prompt, occasions);
  const templates = templatesFor(occasions);
  const usedKeys = new Set();
  const outfits = [];
  const palette = profile.palette || [];
  const avoid = profile.avoid || [];

  for (let t = 0; t < templates.length && outfits.length < count; t++) {
    const families = templates[t];
    // Try a few seeds so color/cut can lock in
    let built = null;
    for (let attempt = 0; attempt < 12 && !built; attempt++) {
      const localUsed = new Set(usedKeys);
      // On later attempts, skip already-tried anchors by poisoning usedKeys lightly
      if (attempt > 0) {
        for (const k of [...usedKeys].slice(0, attempt)) localUsed.add(k);
      }
      const picked = [];
      let anchorColors = [...palette].filter((c) => !avoid.includes(c));
      let preferCut = null;
      let avoidCut = null;
      let allowAccent = true;
      const formalish = FORMAL_OCCASIONS.has(occasions[0])
        || occasions.includes("wedding")
        || occasions.includes("funeral")
        || occasions.includes("work");

      for (const fam of families) {
        const item = pickCoordinated(fam, {
          prompt,
          occasions,
          target,
          palette,
          avoid,
          usedKeys: localUsed,
          anchorColors,
          allowAccent: allowAccent && fam !== "blazer",
          preferCut: fam === "trouser" ? preferCut : null,
          avoidCut: fam === "trouser" && !formalish ? avoidCut : null,
        });
        if (!item) continue;
        localUsed.add(item.key);
        picked.push(item);

        if (!anchorColors.length || fam === "blazer" || fam === "shirt") {
          const tags = extractColorTags(item);
          if (tags.length) {
            anchorColors = [...new Set([
              ...anchorColors,
              ...tags.filter(isNeutralTag),
              tags[0],
            ])].slice(0, 3);
          }
        }
        if (fam === "shirt" || fam === "blazer") {
          const cut = item.cut || "straight";
          if (formalish) {
            // Tailoring: prefer clean straight/fitted bottoms, don't force relaxed
            preferCut = cut === "relaxed" ? "fitted" : "straight";
            avoidCut = "relaxed";
          } else if (cut === "fitted") {
            preferCut = "relaxed";
            avoidCut = "fitted";
          } else if (cut === "relaxed") {
            preferCut = "fitted";
            avoidCut = "relaxed";
          } else {
            preferCut = "fitted";
            avoidCut = null;
          }
        }
        const stats = outfitColorStats(picked);
        if (stats.accentCount >= 1) allowAccent = false;
      }

      if (picked.length < 4) continue;
      // Harden against any accidental duplicate families from picks
      const resolve = (k) => CATALOG[k] || picked.find((p) => p.key === k);
      let uniqueKeys = enforceOnePerCategory(picked.map((i) => i.key), resolve);
      // Guarantee floor (and blazer when occasion requires outer)
      const requireOuter = Boolean(target?.requireOuter)
        || occasions.includes("wedding")
        || occasions.includes("funeral")
        || occasions.includes("work");
      uniqueKeys = fillMissingCoreSlots(uniqueKeys, {
        resolve,
        requireOuter,
        usedKeys: localUsed,
        pickFamily: (fam, used, opts = {}) => pickCoordinated(fam, {
          prompt,
          occasions,
          target,
          palette,
          avoid,
          usedKeys: used,
          anchorColors,
          allowAccent: false,
          preferCut: null,
          avoidCut: null,
          requireOuter,
          relax: opts.relax,
        }),
      });
      // Optional bonus accessory when template asked and still missing
      if (families.includes("sunglasses") || families.includes("scarf")) {
        const bonusFam = families.find((f) => BONUS_ACCESSORY_FAMILIES.includes(f));
        if (bonusFam && !uniqueKeys.some((k) => resolve(k)?.family === bonusFam)) {
          const bonus = pickCoordinated(bonusFam, {
            prompt,
            occasions,
            target,
            palette,
            avoid,
            usedKeys: localUsed,
            anchorColors,
            allowAccent: true,
            preferCut: null,
            avoidCut: null,
          });
          if (bonus?.key) {
            localUsed.add(bonus.key);
            uniqueKeys = enforceOnePerCategory([...uniqueKeys, bonus.key], resolve);
          }
        }
      }
      const uniqueItems = uniqueKeys.map((k) => resolve(k)).filter(Boolean);
      if (uniqueItems.length < 4) continue;
      const check = validateOutfit(uniqueItems, target, occasions);
      if (!check.ok) continue;
      built = uniqueItems;
    }

    if (!built) continue;
    for (const it of built) usedKeys.add(it.key);
    const why = buildWhyThisWorks(built, prompt, occasions);
    outfits.push({
      id: `coord-${outfits.length + 1}`,
      option: outfits.length + 1,
      items: built.map((i) => i.key),
      rationale: why,
      whyThisWorks: why,
      styleFamily: occasions.includes("active")
        ? "streetwear"
        : occasions.includes("wedding") || occasions.includes("funeral") || occasions.includes("work")
          ? "classy"
          : occasions.includes("dinner")
            ? "modern"
            : "relaxed",
      occasions,
      formalityTarget: target,
    });
  }

  return outfits;
}

export function resolveOutfitItems(outfit) {
  return (outfit?.items || []).map((k) => CATALOG[k]).filter(Boolean);
}
