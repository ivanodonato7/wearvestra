/**
 * Verify every occasion outfit includes shirt + trouser + shoe + belt.
 * Usage: node scripts/test-outfit-floor.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { applyLiveProducts, CATALOG } from "../src/catalogStore.js";
import { composeLiveOccasionOutfits, detectOccasions } from "../src/occasionPipeline.js";
import { REQUIRED_FLOOR_FAMILIES, validateLookShape } from "../src/outfitAssembly.js";

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

let failed = 0;
const report = [];

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
    const line = {
      option: outfit.option,
      count: items.length,
      families,
      missingFloor: missing,
      shapeOk: shape.ok,
      shapeReason: shape.reason || null,
    };
    rows.push(line);
    const status = shape.ok && missing.length === 0 ? "OK" : "FAIL";
    if (status === "FAIL") failed += 1;
    console.log(
      `  #${outfit.option} ${status} count=${items.length} families=[${families.join(", ")}]${
        missing.length ? ` missing=${missing.join(",")}` : ""
      }${shape.reason ? ` reason=${shape.reason}` : ""}`
    );
  }
  report.push({ id, outfits: rows });
}

fs.writeFileSync(
  "/opt/cursor/artifacts/outfit-floor-test.json",
  JSON.stringify({ failed, report }, null, 2)
);
console.log(`\n${failed ? "FAILED" : "PASSED"} — failures=${failed}`);
process.exit(failed ? 1 : 0);
