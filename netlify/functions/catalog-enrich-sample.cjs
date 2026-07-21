/**
 * Enrich 10 fixed sample items with Claude for quality review.
 * Does NOT touch the full catalog. Full sync enrichment stays gated by CATALOG_ENRICH=1.
 *
 * GET/POST /api/catalog-enrich-sample
 */
const { enrichCatalogItems, estimateFullCatalogCost } = require("./lib/catalogEnrich.cjs");

/** Diverse slice of the live catalog — embedded so the function never loads the 2.3MB JSON. */
const SAMPLE_ITEMS = [
  { key: "aw-38887429825", name: "LINEN BLAZER", brand: "AlbertoNardoniStore", category: "General Clothing", family: "blazer" },
  { key: "aw-38887585815", name: "Men's French Cuff Mini Plus Patter Spread Collar Regular Fit Dress Shirt & Tie Set In White & Red", brand: "AlbertoNardoniStore", category: "General Clothing", family: "shirt" },
  { key: "aw-41666310336", name: "WEST BAY Pleated Chino Mens Corduroy Trousers Blue Straight 90s W35 L30", brand: "Loopi", category: "General Clothing", family: "trouser" },
  { key: "aw-38868251931", name: "1920's Gangster Wingtip Men's Dress Shoe - Black and White", brand: "Bravo", category: "General Clothing", family: "shoe" },
  { key: "aw-43302305331", name: "CHAMPION Mens Blue Pullover Hoodie S Cotton Blend Casual Sportswear", brand: "Loopi", category: "General Clothing", family: "shirt" },
  { key: "aw-42563203683", name: "NIKE Mens Red & Black Sports Casual Athletic Shorts S W23 Elite", brand: "Loopi", category: "General Clothing", family: "trouser" },
  { key: "aw-40757611789", name: "Båld Sneaker | shoe size: 40", brand: "Dauntless", category: "General Clothing", family: "shoe" },
  { key: "aw-45016456809", name: "Fynch Hatton Polo 2-Tone Piquee Polo Shirt - Beige - XL", brand: "Fynch Hatton", category: "Men's Tops", family: "shirt" },
  { key: "aw-40783542022", name: "Torino Black Belt", brand: "Santoro Milan", category: "Men's Suits", family: "belt" },
  { key: "aw-40959253744", name: "DICKIES Cargo Mens Trousers Beige Regular Straight W30 L32", brand: "Loopi", category: "General Clothing", family: "trouser" },
];

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };
  try {
    if (event.httpMethod === "OPTIONS") {
      return { statusCode: 204, headers, body: "" };
    }

    const cost = {
      haiku: estimateFullCatalogCost({ itemCount: 2503, model: "claude-haiku-4-5" }),
      sonnet: estimateFullCatalogCost({ itemCount: 2503, model: "claude-sonnet-4-6" }),
    };

    if (!process.env.ANTHROPIC_API_KEY) {
      return {
        statusCode: 503,
        headers,
        body: JSON.stringify({
          error: "ANTHROPIC_API_KEY not configured",
          costEstimateFullCatalog: cost,
          sampleWouldBe: SAMPLE_ITEMS,
        }),
      };
    }

    const model = process.env.CATALOG_ENRICH_SAMPLE_MODEL
      || process.env.CATALOG_ENRICH_MODEL
      || "claude-haiku-4-5";
    const { items: enriched, stats } = await enrichCatalogItems(SAMPLE_ITEMS, {
      limit: 10,
      model,
      batchSize: 10,
    });

    const report = enriched.map((i) => ({
      key: i.key,
      name: i.name,
      brand: i.brand,
      awinCategory: i.categoryRaw || i.category,
      enrichment: {
        formality: i.formalityLabel || i.enrichment?.formalityLabel,
        formalityScore: i.formality,
        colors: i.colors || i.paletteTags || [],
        fit: i.fit || i.cut,
        category: i.family || i.category,
        confidence: i.enrichmentConfidence,
        note: i.enrichment?.enrichmentNote || null,
      },
    }));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        costEstimateFullCatalog: cost,
        sampleStats: stats,
        sample: report,
        note: "Sample only. Full-catalog enrichment runs when CATALOG_ENRICH=1 on daily sync.",
      }),
    };
  } catch (err) {
    return {
      statusCode: 502,
      headers,
      body: JSON.stringify({ error: String(err && err.message ? err.message : err) }),
    };
  }
};
