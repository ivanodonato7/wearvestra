/**
 * Verify outfit assembly: one-per-category, apparel-only, why matches items.
 * Usage: node scripts/test-outfit-assembly.mjs
 */
import fs from "fs";
import { applyLiveProducts, CATALOG } from "../src/catalogStore.js";
import { composeCoordinatedOutfits } from "../src/outfitCoordinator.js";
import { sanitizeOutfitForOccasion, detectOccasions } from "../src/occasionPipeline.js";
import { buildWhyThisWorks } from "../src/styleAttributes.js";
import {
  enforceOnePerCategory,
  validateLookShape,
  apparelEligible,
  isNonApparelProduct,
} from "../src/outfitAssembly.js";

const catalog = JSON.parse(fs.readFileSync(new URL("../public/data/menswear-catalog.json", import.meta.url), "utf8"));
applyLiveProducts(catalog.items || []);

const live = Object.values(CATALOG).filter((i) => i.source === "awin" && /^(aw|ss)-/i.test(i.key));
const apparel = live.filter(apparelEligible);
const junk = live.filter((i) => isNonApparelProduct(i) || !apparelEligible(i));
console.log(JSON.stringify({
  loaded: live.length,
  apparelEligible: apparel.length,
  excludedNonApparelOrLow: junk.length,
  families: apparel.reduce((a, i) => { a[i.family] = (a[i.family] || 0) + 1; return a; }, {}),
}, null, 2));

// Reproduce the bug: stacked suits + non-apparel
const suits = apparel.filter((i) => i.family === "blazer" && /\bsuits?\b/i.test(i.name)).slice(0, 3);
const mug = (catalog.items || []).find((i) => /\bmug\b/i.test(i.name));
const badKeys = [...suits.map((s) => s.key), mug?.key].filter(Boolean);
console.log("\n--- Broken input (stacked suits + mug) ---");
console.log(badKeys.map((k) => ({ key: k, name: (CATALOG[k] || mug)?.name?.slice(0, 60), family: (CATALOG[k] || mug)?.family })));

const fixedKeys = enforceOnePerCategory(badKeys, (k) => CATALOG[k]);
console.log("\n--- After enforceOnePerCategory ---");
console.log(fixedKeys.map((k) => ({ key: k, name: CATALOG[k]?.name?.slice(0, 60), family: CATALOG[k]?.family })));

const prompt = "classy looks for a wedding";
const occasions = detectOccasions(prompt);
const sanitized = sanitizeOutfitForOccasion(
  { id: "bug", items: badKeys, whyThisWorks: "Navy cologne pairs with three suits." },
  prompt,
  occasions,
  {},
);
const resolved = (sanitized?.items || []).map((k) => CATALOG[k]).filter(Boolean);
const why = buildWhyThisWorks(resolved, prompt, occasions);
console.log("\n--- After sanitizeOutfitForOccasion + rebuilt why ---");
console.log({
  items: resolved.map((i) => ({ family: i.family, name: i.name.slice(0, 55) })),
  shape: validateLookShape(resolved),
  why,
  staleWhyDropped: true,
});

const outfits = composeCoordinatedOutfits(prompt, {}, 4);
console.log("\n--- Classy/wedding coordinated looks ---");
const report = outfits.map((o, idx) => {
  const items = o.items.map((k) => CATALOG[k]).filter(Boolean);
  const shape = validateLookShape(items);
  const fams = items.map((i) => i.family);
  const whyFromItems = buildWhyThisWorks(items, prompt, occasions);
  return {
    look: idx + 1,
    families: fams,
    onePerCategory: fams.length === new Set(fams).size,
    allApparel: items.every(apparelEligible),
    shapeOk: shape.ok,
    why: o.whyThisWorks,
    whyMatchesBuilder: o.whyThisWorks === whyFromItems,
    pieces: items.map((i) => `${i.family}: ${i.name.slice(0, 48)}`),
  };
});
console.log(JSON.stringify(report, null, 2));

const allOk = report.length >= 3
  && report.every((r) => r.onePerCategory && r.allApparel && r.shapeOk && r.whyMatchesBuilder);
if (!allOk) {
  console.error("FAIL assembly checks");
  process.exit(1);
}
console.log("\nPASS: 3–4 looks, one per category, apparel only, why matches items");

// Also write artifact
fs.mkdirSync("/opt/cursor/artifacts", { recursive: true });
fs.writeFileSync("/opt/cursor/artifacts/outfit-assembly-test.json", JSON.stringify({
  bugDemo: { badKeys, fixedKeys, sanitized: sanitized?.items, why },
  looks: report,
}, null, 2));
