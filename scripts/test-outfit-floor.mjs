/**
 * Outfit floor + hero color/pattern checks across key occasions.
 * Usage: node scripts/test-outfit-floor.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { applyLiveProducts, CATALOG } from "../src/catalogStore.js";
import { composeLiveOccasionOutfits, detectOccasions, sanitizeOutfitForOccasion } from "../src/occasionPipeline.js";
import { REQUIRED_FLOOR_FAMILIES, validateLookShape, BONUS_ACCESSORY_FAMILIES } from "../src/outfitAssembly.js";
import { pickOutfitHeroPhoto } from "../src/outfitHeroPhotos.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const catalogPath = path.join(__dirname, "../public/data/menswear-catalog.json");
const raw = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
applyLiveProducts(Array.isArray(raw) ? raw : (raw.items || []));

const PROMPTS = [
  { id: "wedding", prompt: "Dress me for a wedding" },
  { id: "first date", prompt: "Help me dress for a first date" },
  { id: "funeral", prompt: "What to wear to a funeral" },
  { id: "job interview", prompt: "Outfit for a job interview" },
  { id: "gym", prompt: "What should I wear to the gym" },
  { id: "weekend casual", prompt: "Weekend casual, nothing fussy" },
];

const profile = {
  name: "Alex",
  palette: ["Navy", "White", "Charcoal", "Camel"],
  avoid: [],
  fit: "Fitted",
  budget: "balanced",
};

function categorize(families) {
  const top = families.includes("shirt") || families.includes("blazer");
  const bottom = families.includes("trouser");
  const shoes = families.includes("shoe");
  const belt = families.includes("belt");
  const accessory = families.some((f) => BONUS_ACCESSORY_FAMILIES.includes(f));
  return { top, bottom, shoes, belt, accessory: accessory || false };
}

function heroOk(pick) {
  const primary = pick.attrs?.primaryColor;
  const photoColors = pick.photo?.colors || [];
  const lead = photoColors[0];
  // Hard misses
  if (primary !== "colorful" && photoColors.includes("colorful") && pick.photo?.formality === "street") return false;
  if (lead === "black" && primary !== "black") return false;
  if (primary === "grey" && lead === "navy") return false;
  if ((primary === "green" || primary === "olive")
    && !(photoColors.includes("green") || photoColors.includes("olive"))) return false;
  // Match
  if (photoColors.some((c) => c === primary)) return true;
  if (primary === "green" && photoColors.includes("olive")) return true;
  if (primary === "olive" && photoColors.includes("green")) return true;
  if (primary === "grey" && photoColors.includes("grey")) return true;
  return pick.score >= 40;
}

let failed = 0;
const report = [];

console.log("\n=== FLOOR + HERO (local composer) ===");
for (const { id, prompt } of PROMPTS) {
  const outfits = composeLiveOccasionOutfits(prompt, profile, 3);
  const occasions = detectOccasions(prompt);
  console.log(`\n=== ${id} (occasions=${occasions.join(",")}) outfits=${outfits.length} ===`);
  if (!outfits.length) {
    console.log("FAIL: no outfits");
    failed += 1;
    report.push({ id, outfits: [] });
    continue;
  }
  const rows = [];
  for (const outfit of outfits) {
    const items = (outfit.items || []).map((k) => CATALOG[k]).filter(Boolean);
    const families = items.map((i) => i.family || i.type);
    const shape = validateLookShape(items, { requireFloor: true });
    const missing = REQUIRED_FLOOR_FAMILIES.filter((f) => !families.includes(f));
    const cats = categorize(families);
    const hero = pickOutfitHeroPhoto({
      items: outfit.items,
      catalog: CATALOG,
      occasion: occasions[0],
      styleFamily: outfit.styleFamily,
      prompt,
      seed: `${id}:${outfit.option}`,
    });
    const hOk = heroOk(hero);
    const status = shape.ok && missing.length === 0 && hOk ? "OK" : "FAIL";
    if (status === "FAIL") failed += 1;
    const line = {
      option: outfit.option,
      count: items.length,
      families,
      categories: cats,
      missingFloor: missing,
      heroFile: hero.file,
      heroColors: hero.photo?.colors,
      heroPrimary: hero.attrs?.primaryColor,
      heroPattern: hero.attrs?.pattern,
      heroOk: hOk,
      shapeOk: shape.ok,
    };
    rows.push(line);
    console.log(
      `  #${outfit.option} ${status} count=${items.length} ` +
      `cats={top:${cats.top},bottom:${cats.bottom},shoes:${cats.shoes},belt:${cats.belt},acc:${cats.accessory}} ` +
      `families=[${families.join(", ")}] ` +
      `hero=${hero.file} primary=${hero.attrs.primaryColor} photo=[${(hero.photo?.colors || []).join(",")}] pattern=${hero.attrs.pattern}`
    );
    if (missing.length) console.log(`    missing floor: ${missing.join(",")}`);
    if (!hOk) console.log(`    hero mismatch score=${hero.score}`);
  }
  report.push({ id, outfits: rows });
}

// Simulate Claude incomplete looks (the production failure mode)
console.log("\n=== CLAUDE INCOMPLETE → SANITIZE FLOOR ===");
const greySuit = Object.values(CATALOG).find((i) => /Grey & Red Windowpane/i.test(i.name));
const greenBlazer = Object.values(CATALOG).find((i) => /Green Velvet/i.test(i.name) && i.family === "blazer");
const shirt = Object.values(CATALOG).find((i) => i.family === "shirt" && i.shopUrl && !/set\b/i.test(i.name));
const trouser = Object.values(CATALOG).find((i) => i.family === "trouser" && i.shopUrl && /wool|chino|trouser/i.test(i.name) && !/suit/i.test(i.name));
const beigeTrouser = Object.values(CATALOG).find((i) => (
  i.family === "trouser"
  && i.shopUrl
  && /beige|khaki|tan|sand|stone/i.test(i.name)
  && !/suit/i.test(i.name)
));
const shoe = Object.values(CATALOG).find((i) => i.family === "shoe" && i.shopUrl && /dress|oxford|derby|loafer/i.test(i.name));
const belt = Object.values(CATALOG).find((i) => i.family === "belt" && i.shopUrl && /\bbelt\b/i.test(i.name));

const simulations = [
  {
    id: "look1-missing-belt",
    prompt: "Dress me for a classy wedding",
    styleFamily: "classy",
    items: [greySuit?.key, shirt?.key, trouser?.key, shoe?.key].filter(Boolean),
  },
  {
    id: "look2-missing-shoe",
    prompt: "Help me dress for a first date",
    styleFamily: "modern",
    items: [greenBlazer?.key, shirt?.key, (beigeTrouser || trouser)?.key, belt?.key].filter(Boolean),
  },
];

for (const sim of simulations) {
  const occasions = detectOccasions(sim.prompt);
  const cleaned = sanitizeOutfitForOccasion(
    { option: 1, styleFamily: sim.styleFamily, items: sim.items },
    sim.prompt,
    occasions,
    profile,
  );
  if (!cleaned) {
    console.log(`  ${sim.id} FAIL sanitize returned null`);
    failed += 1;
    continue;
  }
  const items = cleaned.items.map((k) => CATALOG[k]).filter(Boolean);
  const families = items.map((i) => i.family);
  const cats = categorize(families);
  const missing = REQUIRED_FLOOR_FAMILIES.filter((f) => !families.includes(f));
  const hero = pickOutfitHeroPhoto({
    items: cleaned.items,
    catalog: CATALOG,
    occasion: occasions[0],
    styleFamily: sim.styleFamily,
    prompt: sim.prompt,
    seed: sim.id,
  });
  const hOk = heroOk(hero);
  const status = missing.length === 0 && hOk ? "OK" : "FAIL";
  if (status === "FAIL") failed += 1;
  console.log(
    `  ${sim.id} ${status} count=${items.length} ` +
    `cats={top:${cats.top},bottom:${cats.bottom},shoes:${cats.shoes},belt:${cats.belt},acc:${cats.accessory}} ` +
    `families=[${families.join(", ")}] ` +
    `hero=${hero.file} primary=${hero.attrs.primaryColor} photo=[${(hero.photo?.colors || []).join(",")}] pattern=${hero.attrs.pattern}`
  );
  if (missing.length) console.log(`    missing: ${missing.join(",")}`);
  if (!hOk) console.log(`    hero mismatch`, hero.attrs, hero.photo);
  report.push({ id: sim.id, count: items.length, families, cats, hero: hero.file, heroOk: hOk, names: items.map((i) => i.name) });
}

fs.writeFileSync(
  "/opt/cursor/artifacts/outfit-floor-hero-test.json",
  JSON.stringify({ failed, report }, null, 2),
);
console.log(`\n${failed ? "FAILED" : "PASSED"} — failures=${failed}`);
process.exit(failed ? 1 : 0);
