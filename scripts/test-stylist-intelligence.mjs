/**
 * Test coordinated stylist outfits: items + whyThisWorks for 6 occasions.
 * Also prints a sample of what the AI would receive as catalog cards.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { applyLiveProducts, liveCatalogItems, catalogSource } from "../src/catalogStore.js";
import { catalogPayloadForStylist, describeOutfitItems, detectOccasions } from "../src/occasionPipeline.js";
import { composeCoordinatedOutfits, resolveOutfitItems } from "../src/outfitCoordinator.js";
import { outfitColorStats, cutsBalance } from "../src/styleAttributes.js";
import { itemFitsOccasion, occasionFormalityTarget } from "../src/formality.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const raw = JSON.parse(fs.readFileSync(path.join(__dirname, "../public/data/menswear-catalog.json"), "utf8"));
const arr = Array.isArray(raw) ? raw : (raw.items || []);
applyLiveProducts(arr);

const PROMPTS = [
  { id: "wedding", prompt: "Dress me for a wedding" },
  { id: "gym", prompt: "What should I wear to the gym" },
  { id: "job interview", prompt: "Outfit for a job interview" },
  { id: "funeral", prompt: "What to wear to a funeral" },
  { id: "first date", prompt: "Help me dress for a first date" },
  { id: "weekend casual", prompt: "Weekend casual, nothing fussy" },
];

const profile = {
  archetype: "Classic Polished",
  fit: "Tailored / fitted",
  lifestyle: "Office / client-facing",
  palette: ["Navy", "Grey / Charcoal", "Black", "Ivory / Cream"],
  avoid: [],
  budget: "balanced",
};

// --- Data quality report ---
const live = liveCatalogItems();
const genericCat = live.filter((i) => !i.category || /general/i.test(i.category)).length;
const withDesc = live.filter((i) => i.description).length;
const withCut = live.filter((i) => i.cut && i.cut !== "straight").length;
const withColors = live.filter((i) => (i.colors || []).length).length;

console.log("=== CATALOG ATTRIBUTE QUALITY (honest) ===");
console.log(JSON.stringify({
  catalogSource,
  liveCount: live.length,
  brand: `${live.filter((i) => i.brand).length}/${live.length} have brand`,
  formality: "100% derived by us from product name (Awin does not ship formality)",
  colors: `${withColors}/${live.length} have inferred color tags from name (merchant colour field often empty)`,
  cut: `${withCut}/${live.length} have non-default cut from name keywords; rest default to straight`,
  category: `${genericCat}/${live.length} are "General Clothing" or null — category is mostly useless`,
  description: `${withDesc}/${live.length} have description — effectively none`,
}, null, 2));

// Sample AI payload for wedding
const samplePayload = catalogPayloadForStylist("Dress me for a wedding", 8);
console.log("\n=== SAMPLE AI CATALOG CARDS (wedding, first 6) ===");
for (const card of samplePayload.catalogItems.slice(0, 6)) {
  console.log(JSON.stringify(card));
}

let failures = 0;

for (const row of PROMPTS) {
  const occasions = detectOccasions(row.prompt);
  const target = occasionFormalityTarget(row.prompt, occasions);
  const outfits = composeCoordinatedOutfits(row.prompt, profile, 3);

  console.log("\n" + "=".repeat(72));
  console.log(`OCCASION: ${row.id.toUpperCase()}`);
  console.log(`Prompt: "${row.prompt}"`);
  console.log(`Detected: ${occasions.join(", ") || "(none)"} | target=${target.label} ${target.min}-${target.max}`);
  console.log(`Outfits: ${outfits.length}`);

  if (!outfits.length) {
    failures += 1;
    console.log("FAIL: no coordinated outfits");
    continue;
  }

  // Show look 1 in full detail (user asked for actual items + reasoning)
  for (const outfit of outfits.slice(0, 3)) {
    const items = resolveOutfitItems(outfit);
    const described = describeOutfitItems(outfit.items);
    const stats = outfitColorStats(items);
    const byFam = {};
    for (const it of items) byFam[it.family] = it;
    const bal = cutsBalance(byFam);
    const problems = [];

    if (!outfit.whyThisWorks && !outfit.rationale) problems.push("missing whyThisWorks");
    if (stats.accentCount > 1) problems.push(`too many accents: ${stats.accents.join(",")}`);
    // Primaries only — neutrals may stack; fail if >3 distinct primary colors
    if (stats.colorCount > 3) problems.push(`too many primary colors: ${stats.colors.join(",")}`);
    const formalish = ["wedding", "funeral", "job interview"].includes(row.id);
    if (!bal.ok && row.id !== "gym" && !(formalish && bal.reason === "all-fitted")) {
      problems.push(`silhouette: ${bal.reason}`);
    }
    for (const d of described) {
      if (!d.brand) problems.push(`no brand: ${d.name}`);
      if (!d.shopUrl?.includes("awin1.com")) problems.push(`bad link: ${d.name}`);
      if (itemFitsOccasion(items.find((i) => i.key === d.key), target).reason === "hardBan") {
        problems.push(`hardBan: ${d.name}`);
      }
    }
    if (row.id === "wedding" || row.id === "funeral" || row.id === "job interview") {
      const blob = described.map((d) => d.name).join(" ");
      if (/\b(cargo|sneaker|trainer|hoodie|jogger|gym\s*short)\b/i.test(blob)) {
        problems.push("casual piece in formal look");
      }
    }
    if (row.id === "gym") {
      const blob = described.map((d) => d.name).join(" ");
      if (/\b(blazer|suit\b|dress\s*shoe|loafer|oxford)\b/i.test(blob)) {
        problems.push("formal piece in gym look");
      }
    }

    console.log(`\n--- Look ${outfit.option} ---`);
    console.log(`WHY: ${outfit.whyThisWorks || outfit.rationale}`);
    console.log(`Colors: ${stats.colors.join(", ") || "(none)"} | cuts: top=${bal.topCut || "?"} bottom=${bal.bottomCut || "?"}`);
    for (const d of described) {
      console.log(`  • [${d.family}/${d.cut || "?"}] ${d.name}`);
      console.log(`      brand: ${d.brand} | colors: ${(d.colors || []).join(", ") || "—"} | formality: ${d.formality}`);
      console.log(`      shop: ${d.shopUrl}`);
    }
    if (problems.length) {
      failures += 1;
      console.log(`  FAIL: ${problems.join("; ")}`);
    } else {
      console.log("  OK — coordinated + whyThisWorks + awin1.com");
    }
  }
}

console.log("\n" + "=".repeat(72));
console.log(failures === 0 ? "ALL STYLIST INTELLIGENCE TESTS PASSED" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
