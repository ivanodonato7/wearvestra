/**
 * Offline occasion formality test against the live Awin static catalog.
 * Prints actual outfits (name, brand, shopUrl) for 6 occasions.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { applyLiveProducts, CATALOG, liveCatalogItems, catalogSource } from "../src/catalogStore.js";
import { occasionFormalityTarget, itemFitsOccasion } from "../src/formality.js";
import {
  detectOccasions,
  composeLiveOccasionOutfits,
  describeOutfitItems,
} from "../src/occasionPipeline.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const catalogPath = path.join(__dirname, "../public/data/menswear-catalog.json");

const raw = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
const items = Array.isArray(raw) ? raw : (raw.items || []);
const applied = applyLiveProducts(items);

const PROMPTS = [
  { id: "wedding", prompt: "Dress me for a wedding" },
  { id: "gym", prompt: "What should I wear to the gym" },
  { id: "job interview", prompt: "Outfit for a job interview" },
  { id: "funeral", prompt: "What to wear to a funeral" },
  { id: "first date", prompt: "Help me dress for a first date" },
  { id: "weekend casual", prompt: "Weekend casual, nothing fussy" },
];

const BANNED_BY_OCCASION = {
  wedding: /\b(cargo|jogger|sweatpants?|hoodie|gym|sneaker|trainer|shorts\b|jean|denim)\b/i,
  gym: /\b(tuxedo|suit\b|blazer|dress\s*shoe|oxford|derby|loafer|wingtip|monk)\b/i,
  "job interview": /\b(cargo|jogger|sweatpants?|hoodie|gym|sneaker|shorts\b|ripped)\b/i,
  funeral: /\b(cargo|jogger|sweatpants?|hoodie|gym|sneaker|shorts\b)\b/i,
  "first date": /\b(cargo|jogger|sweatpants?|hoodie|gym|shorts\b)\b/i,
  "weekend casual": /\b(tuxedo|black\s*tie)\b/i,
};

function assertOutfit(label, outfit, prompt) {
  const occasions = detectOccasions(prompt);
  const target = occasionFormalityTarget(prompt, occasions);
  const ban = BANNED_BY_OCCASION[label];
  const described = describeOutfitItems(outfit.items);
  const problems = [];

  if (described.length < 3) problems.push("fewer than 3 items");
  for (const d of described) {
    if (d.missing) problems.push(`missing catalog row ${d.key}`);
    if (!d.brand) problems.push(`no brand: ${d.key}`);
    if (!d.shopUrl || !String(d.shopUrl).includes("awin1.com")) {
      problems.push(`bad shop link: ${d.name || d.key}`);
    }
    if (d.source && d.source !== "awin") problems.push(`not awin: ${d.name}`);
    if (ban && ban.test([d.name, d.category, d.family].join(" "))) {
      problems.push(`banned for ${label}: ${d.name}`);
    }
    const fit = itemFitsOccasion(CATALOG[d.key], target);
    if (fit.reason === "hardBan") problems.push(`hardBan: ${d.name}`);
  }
  if (target.requireOuter) {
    const hasBlazer = described.some((d) => d.family === "blazer");
    if (!hasBlazer) problems.push("missing required outer/blazer");
  }
  if (target.forbidOuter) {
    const hasBlazer = described.some((d) => d.family === "blazer");
    if (hasBlazer) problems.push("has forbidden blazer");
  }
  // Family coherence — a "shoe" slot must look like footwear
  for (const d of described) {
    const n = String(d.name || "");
    if (d.family === "shoe" && !/\b(shoe|boot|sneaker|trainer|loafer|derby|oxford|monk|footwear|wingtip|brogue)\b/i.test(n)) {
      problems.push(`incoherent shoe: ${d.name}`);
    }
    if (d.family === "trouser" && /\b(shoe|loafer|derby|sneaker)\b/i.test(n) && !/\b(trouser|pant|chino|jean|jogger|short)\b/i.test(n)) {
      problems.push(`incoherent trouser: ${d.name}`);
    }
    if (d.family === "shirt" && /\bsock/i.test(n)) problems.push(`socks as shirt: ${d.name}`);
  }
  return { described, problems, target, occasions };
}

console.log(JSON.stringify({
  catalogSource,
  appliedCount: applied.count,
  liveCount: liveCatalogItems().length,
}, null, 2));

const report = [];
let failures = 0;

for (const row of PROMPTS) {
  const outfits = composeLiveOccasionOutfits(row.prompt, {
    archetype: "Classic Polished",
    fit: "Tailored / fitted",
    lifestyle: "Office / client-facing",
    palette: ["Navy", "Grey / Charcoal", "Black", "Ivory / Cream"],
    avoid: [],
    budget: "balanced",
  }, 3);

  console.log("\n" + "=".repeat(72));
  console.log(`OCCASION: ${row.id.toUpperCase()}`);
  console.log(`Prompt: "${row.prompt}"`);
  console.log(`Detected: ${detectOccasions(row.prompt).join(", ") || "(none)"}`);
  console.log(`Outfits returned: ${outfits.length}`);

  if (!outfits.length) {
    failures += 1;
    console.log("FAIL: no outfits");
    report.push({ id: row.id, ok: false, outfits: [] });
    continue;
  }

  const outfitReports = [];
  for (const outfit of outfits.slice(0, 3)) {
    const { described, problems, target } = assertOutfit(row.id, outfit, row.prompt);
    console.log(`\n--- Look ${outfit.option} (formality target: ${target.label} ${target.min}-${target.max}) ---`);
    for (const d of described) {
      console.log(`  • [${d.family}] ${d.name}`);
      console.log(`      brand: ${d.brand} | formality: ${d.formality}`);
      console.log(`      shop: ${d.shopUrl}`);
      if (d.category) console.log(`      category: ${d.category}`);
    }
    if (problems.length) {
      failures += 1;
      console.log(`  FAIL: ${problems.join("; ")}`);
    } else {
      console.log("  OK — formality + brand + awin1.com link");
    }
    outfitReports.push({ items: described, problems });
  }
  report.push({ id: row.id, ok: outfitReports.every((o) => !o.problems.length), outfits: outfitReports });
}

console.log("\n" + "=".repeat(72));
console.log(failures === 0 ? "ALL OCCASION TESTS PASSED" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
