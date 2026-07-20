/**
 * Occasion → live Awin product pipeline.
 * Shared by the UI composer and offline formality tests.
 */
import {
  CATALOG,
  catalogSource,
  liveCatalogItems,
  pickLiveForFamily,
  occasionFormalityTarget,
  itemFitsOccasion,
} from "./catalogStore.js";
import { formalityScore } from "./formality.js";
import { composeCoordinatedOutfits } from "./outfitCoordinator.js";
import { buildWhyThisWorks } from "./styleAttributes.js";
import { detectOccasions, OCCASION_KEYWORDS } from "./occasions.js";

export { detectOccasions, OCCASION_KEYWORDS };

export function familyOfKey(key) {
  if (!key) return null;
  const item = CATALOG[key];
  if (item?.family) return item.family;
  if (item?.type && item.type !== "accessory") return item.type;
  return null;
}

/**
 * Recipe family templates the local composer remaps onto live products.
 * Mirrors the high-scoring recipe silhouettes per occasion band.
 */
const OCCASION_FAMILY_TEMPLATES = {
  wedding: [
    ["blazer", "shirt", "trouser", "shoe"],
    ["blazer", "shirt", "trouser", "shoe", "belt"],
    ["blazer", "shirt", "trouser", "shoe", "scarf"],
  ],
  funeral: [
    ["blazer", "shirt", "trouser", "shoe"],
    ["blazer", "shirt", "trouser", "shoe", "belt"],
  ],
  work: [
    ["blazer", "shirt", "trouser", "shoe"],
    ["blazer", "shirt", "trouser", "shoe", "belt"],
    ["shirt", "trouser", "shoe", "belt"],
  ],
  dinner: [
    ["blazer", "shirt", "trouser", "shoe"],
    ["shirt", "trouser", "shoe", "belt"],
    ["blazer", "shirt", "trouser", "shoe", "scarf"],
  ],
  active: [
    ["shirt", "trouser", "shoe"],
    ["shirt", "trouser", "shoe"],
    ["shirt", "trouser", "shoe"],
  ],
  weekend: [
    ["shirt", "trouser", "shoe"],
    ["shirt", "trouser", "shoe", "sunglasses"],
    ["blazer", "shirt", "trouser", "shoe"],
  ],
  default: [
    ["blazer", "shirt", "trouser", "shoe"],
    ["shirt", "trouser", "shoe", "belt"],
    ["shirt", "trouser", "shoe", "sunglasses"],
  ],
};

function templatesForPrompt(prompt, occasions) {
  const o = new Set(occasions || []);
  if (o.has("active")) return OCCASION_FAMILY_TEMPLATES.active;
  if (o.has("wedding") || o.has("event")) return OCCASION_FAMILY_TEMPLATES.wedding;
  if (o.has("funeral")) return OCCASION_FAMILY_TEMPLATES.funeral;
  if (o.has("work")) return OCCASION_FAMILY_TEMPLATES.work;
  if (o.has("dinner") || o.has("sexy")) return OCCASION_FAMILY_TEMPLATES.dinner;
  if (o.has("weekend") || o.has("everyday") || o.has("street")) return OCCASION_FAMILY_TEMPLATES.weekend;
  const target = occasionFormalityTarget(prompt, occasions);
  if (target.label === "formal" || target.label === "formal-dark") return OCCASION_FAMILY_TEMPLATES.wedding;
  if (target.label === "active") return OCCASION_FAMILY_TEMPLATES.active;
  if (target.label === "smart") return OCCASION_FAMILY_TEMPLATES.work;
  return OCCASION_FAMILY_TEMPLATES.default;
}

export function remapOutfitItemsToLive(itemKeys, prompt, occasions, profile = {}) {
  if (catalogSource !== "awin" || !liveCatalogItems().length) {
    return (itemKeys || []).filter((k) => CATALOG[k]);
  }
  const used = new Set();
  const palette = profile?.palette || [];
  const avoid = profile?.avoid || [];
  const target = occasionFormalityTarget(prompt, occasions);
  const out = [];
  for (const key of itemKeys || []) {
    const existing = CATALOG[key];
    const fam = familyOfKey(key) || existing?.family || existing?.type;
    if (!fam) continue;
    // Keep a live item that already fits — don't reshuffle to the same top pick
    if (
      existing?.source === "awin"
      && existing.shopUrl
      && (existing.brand || existing.retailer)
      && itemFitsOccasion(existing, target).ok
    ) {
      used.add(key);
      out.push(key);
      continue;
    }
    const picked = pickLiveForFamily(fam, {
      prompt,
      occasions,
      palette,
      avoid,
      usedKeys: used,
    });
    if (picked?.key) {
      used.add(picked.key);
      out.push(picked.key);
    } else if (existing?.shopUrl) {
      used.add(key);
      out.push(key);
    }
  }
  return out;
}

export function sanitizeOutfitForOccasion(outfit, prompt, occasions, profile = {}) {
  if (!outfit?.items?.length) return null;
  const target = occasionFormalityTarget(prompt, occasions);
  let remapped = remapOutfitItemsToLive(outfit.items, prompt, occasions, profile);
  if (remapped.length < 3) {
    // If keys were already family names / missing, try building from families in items
    remapped = [];
  }
  if (!remapped.length && Array.isArray(outfit.families)) {
    const used = new Set();
    for (const fam of outfit.families) {
      const picked = pickLiveForFamily(fam, {
        prompt,
        occasions,
        palette: profile?.palette || [],
        avoid: profile?.avoid || [],
        usedKeys: used,
      });
      if (picked) {
        used.add(picked.key);
        remapped.push(picked.key);
      }
    }
  }

  let hasOuter = remapped.some((k) => (CATALOG[k]?.family || familyOfKey(k)) === "blazer");
  if (target.requireOuter && !hasOuter) {
    const blazer = pickLiveForFamily("blazer", {
      prompt,
      occasions,
      usedKeys: new Set(remapped),
      palette: profile?.palette || [],
      avoid: profile?.avoid || [],
    });
    if (blazer) remapped = [blazer.key, ...remapped];
  }
  if (target.forbidOuter) {
    remapped = remapped.filter((k) => (CATALOG[k]?.family || familyOfKey(k)) !== "blazer");
  }

  const used = new Set(remapped);
  remapped = remapped.map((k) => {
    const item = CATALOG[k];
    if (!item?.shopUrl) {
      const fam = familyOfKey(k) || item?.family;
      const alt = fam
        ? pickLiveForFamily(fam, {
          prompt,
          occasions,
          usedKeys: used,
          palette: profile?.palette || [],
          avoid: profile?.avoid || [],
        })
        : null;
      if (alt) {
        used.add(alt.key);
        return alt.key;
      }
      return null;
    }
    const fit = itemFitsOccasion(item, target);
    if (!fit.ok && (fit.reason === "hardBan" || fit.reason === "forbidOuter" || fit.reason === "outOfBand")) {
      const fam = item.family || familyOfKey(k);
      used.delete(k);
      const alt = fam
        ? pickLiveForFamily(fam, {
          prompt,
          occasions,
          usedKeys: used,
          palette: profile?.palette || [],
          avoid: profile?.avoid || [],
        })
        : null;
      if (alt) {
        used.add(alt.key);
        return alt.key;
      }
      return null;
    }
    return k;
  }).filter(Boolean);

  if (remapped.length < 3) return null;
  for (const k of remapped) {
    const item = CATALOG[k];
    if (!item?.shopUrl || !(item.brand || item.retailer)) return null;
    if (itemFitsOccasion(item, target).reason === "hardBan") return null;
  }
  return { ...outfit, items: remapped };
}

/** Build N live outfits — coordinated (formality + color + cut), with why-this-works. */
export function composeLiveOccasionOutfits(prompt, profile = {}, count = 3) {
  const coordinated = composeCoordinatedOutfits(prompt, profile, count);
  if (coordinated.length) return coordinated;

  // Fallback: family templates + sanitize (should rarely hit)
  const occasions = detectOccasions(prompt);
  const templates = templatesForPrompt(prompt, occasions);
  const outfits = [];
  const usedKeys = new Set();
  for (let t = 0; t < templates.length && outfits.length < count; t++) {
    const families = templates[t];
    const keys = [];
    const localUsed = new Set(usedKeys);
    for (const fam of families) {
      const picked = pickLiveForFamily(fam, {
        prompt,
        occasions,
        palette: profile.palette || [],
        avoid: profile.avoid || [],
        usedKeys: localUsed,
      });
      if (picked) {
        localUsed.add(picked.key);
        keys.push(picked.key);
      }
    }
    const sanitized = sanitizeOutfitForOccasion(
      { id: `live-${t}`, option: outfits.length + 1, items: keys, families },
      prompt,
      occasions,
      profile,
    );
    if (!sanitized?.items?.length) continue;
    for (const k of sanitized.items) usedKeys.add(k);
    const resolved = sanitized.items.map((k) => CATALOG[k]).filter(Boolean);
    const why = buildWhyThisWorks(resolved, prompt, occasions);
    outfits.push({
      ...sanitized,
      rationale: why,
      whyThisWorks: why,
      occasions,
      formalityTarget: occasionFormalityTarget(prompt, occasions),
    });
  }
  return outfits;
}

export function catalogPayloadForStylist(prompt = "", maxLive = 160) {
  const occasions = detectOccasions(prompt);
  const target = occasionFormalityTarget(prompt, occasions);
  const live = liveCatalogItems();
  if (!live.length) {
    const keys = Object.keys(CATALOG);
    return {
      catalogKeys: keys,
      catalogItems: keys.map((k) => {
        const item = CATALOG[k];
        return item
          ? {
            key: k,
            name: item.name,
            family: item.family || item.type,
            category: item.category || null,
            brand: item.brand || item.retailer || null,
            formality: item.formality ?? formalityScore(item),
            formalityBand: item.formalityBand || null,
            colors: item.colors || item.paletteTags || [],
            cut: item.cut || "straight",
            isNeutral: !!item.isNeutral,
          }
          : null;
      }).filter(Boolean),
      formalityTarget: {
        ...target,
        hardBan: target.hardBan ? target.hardBan.source : null,
      },
    };
  }

  const byFam = {};
  for (const item of live) {
    const fam = item.family || "other";
    if (!byFam[fam]) byFam[fam] = [];
    byFam[fam].push(item);
  }
  for (const fam of Object.keys(byFam)) {
    byFam[fam].sort((a, b) => itemFitsOccasion(b, target).score - itemFitsOccasion(a, target).score);
  }

  const picked = [];
  const fams = Object.keys(byFam);
  for (const fam of fams) {
    picked.push(...byFam[fam].filter((i) => itemFitsOccasion(i, target).ok).slice(0, 28));
  }
  let i = 0;
  while (picked.length < maxLive && fams.some((f) => byFam[f].length)) {
    const fam = fams[i % fams.length];
    const next = byFam[fam].shift();
    if (next && !picked.some((p) => p.key === next.key)) picked.push(next);
    i += 1;
    if (i > maxLive * 4) break;
  }

  const items = picked.slice(0, maxLive).map((item) => ({
    key: item.key,
    name: item.name,
    family: item.family || item.type,
    category: item.category || null,
    brand: item.brand || item.retailer || null,
    formality: item.formality ?? formalityScore(item),
    formalityBand: item.formalityBand || null,
    colors: item.colors || item.paletteTags || [],
    cut: item.cut || "straight",
    isNeutral: !!item.isNeutral,
  }));

  return {
    catalogKeys: items.map((i) => i.key),
    catalogItems: items,
    formalityTarget: {
      ...target,
      hardBan: target.hardBan ? target.hardBan.source : null,
    },
  };
}

export function describeOutfitItems(itemKeys) {
  return (itemKeys || []).map((k) => {
    const item = CATALOG[k];
    if (!item) return { key: k, missing: true };
    return {
      key: k,
      name: item.name,
      brand: item.brand || item.retailer || null,
      family: item.family,
      category: item.category || null,
      formality: item.formality ?? formalityScore(item),
      colors: item.colors || item.paletteTags || [],
      cut: item.cut || null,
      shopUrl: item.shopUrl || item.clickUrl || null,
      source: item.source || null,
    };
  });
}
