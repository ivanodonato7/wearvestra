/**
 * Enrich exactly 10 diverse catalog items with Claude and print the tags.
 * Does NOT write the full catalog. Use this for quality / cost sanity checks.
 *
 *   ANTHROPIC_API_KEY=… node scripts/enrich-catalog-sample.cjs
 */
const fs = require("fs");
const path = require("path");
const {
  enrichCatalogItems,
  estimateFullCatalogCost,
} = require("../netlify/functions/lib/catalogEnrich.cjs");

function pickSample(items, n = 10) {
  const want = [
    { re: /\b(blazer|sport\s*coat)\b/i, fam: "blazer" },
    { re: /\bdress\s*shirt\b/i, fam: "shirt" },
    { re: /\b(chino|trousers?)\b/i, fam: "trouser" },
    { re: /\b(dress\s*shoe|loafer|wingtip|derby)\b/i, fam: "shoe" },
    { re: /\b(hoodie|sweatshirt)\b/i, fam: "shirt" },
    { re: /\b(jogger|athletic\s*shorts?|gym\s*shorts?)\b/i, fam: "trouser" },
    { re: /\b(sneaker|trainer)\b/i, fam: "shoe" },
    { re: /\b(polo|t-?shirt)\b/i, fam: "shirt" },
    { re: /\bbelts?\b/i, fam: "belt" },
    { re: /\bcargo\b/i, fam: "trouser" },
  ];
  const picked = [];
  const used = new Set();
  for (const row of want) {
    const hit = items.find((i) => {
      if (used.has(i.key)) return false;
      if (!row.re.test(i.name || "")) return false;
      // Prefer coherent family when available
      if (row.fam && i.family && i.family !== row.fam && row.fam !== "belt") {
        return false;
      }
      return true;
    }) || items.find((i) => row.re.test(i.name || "") && !used.has(i.key));
    if (hit) {
      used.add(hit.key);
      picked.push(hit);
    }
  }
  for (const i of items) {
    if (picked.length >= n) break;
    if (!used.has(i.key)) {
      used.add(i.key);
      picked.push(i);
    }
  }
  return picked.slice(0, n);
}

async function main() {
  const catalogPath = path.join(__dirname, "..", "public", "data", "menswear-catalog.json");
  const raw = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
  const items = Array.isArray(raw) ? raw : (raw.items || []);
  const sample = pickSample(items, 10);

  console.log("=== COST ESTIMATE (full catalog, before any full run) ===");
  console.log(JSON.stringify(estimateFullCatalogCost({
    itemCount: items.length || 2500,
    batchSize: 20,
    model: process.env.CATALOG_ENRICH_MODEL || "claude-haiku-4-5",
  }), null, 2));
  console.log(JSON.stringify(estimateFullCatalogCost({
    itemCount: items.length || 2500,
    batchSize: 20,
    model: "claude-sonnet-4-6",
  }), null, 2));

  if (!process.env.ANTHROPIC_API_KEY) {
    console.log("\nNo ANTHROPIC_API_KEY — sample items that WOULD be enriched:");
    for (const i of sample) {
      console.log(`- [${i.family}] ${i.name} | brand=${i.brand} | cat=${i.category}`);
    }
    console.log("\nSet ANTHROPIC_API_KEY to run the 10-item Claude sample.");
    process.exit(2);
  }

  console.log("\n=== ENRICHING 10 SAMPLE ITEMS ===");
  const { items: enriched, stats } = await enrichCatalogItems(sample, { limit: 10 });
  console.log("stats", stats);

  const report = enriched.map((i) => ({
    name: i.name,
    brand: i.brand,
    awinCategory: i.categoryRaw || i.category,
    tags: {
      formality: i.formalityLabel || i.enrichment?.formalityLabel,
      formalityScore: i.formality,
      colors: i.colors || i.paletteTags,
      fit: i.fit || i.cut,
      category: i.category,
      confidence: i.enrichmentConfidence,
      note: i.enrichment?.enrichmentNote || null,
    },
  }));

  const outPath = path.join("/tmp", "catalog-enrich-sample.json");
  fs.writeFileSync(outPath, JSON.stringify({ stats, report }, null, 2));
  console.log("\n=== SAMPLE RESULTS ===");
  for (const row of report) {
    console.log("\n•", row.name);
    console.log("  brand:", row.brand);
    console.log("  awin category:", row.awinCategory);
    console.log("  → formality:", row.tags.formality, `(score ${row.tags.formalityScore})`);
    console.log("  → colors:", (row.tags.colors || []).join(", ") || "(none)");
    console.log("  → fit:", row.tags.fit);
    console.log("  → category:", row.tags.category);
    console.log("  → confidence:", row.tags.confidence, row.tags.note ? `| ${row.tags.note}` : "");
  }
  console.log("\nwrote", outPath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
