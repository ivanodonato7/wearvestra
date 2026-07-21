/**
 * Claude enrichment for Awin menswear items — runs once during daily sync.
 * Replaces keyword guessing for formality / colors / fit / category.
 *
 * Env:
 *   ANTHROPIC_API_KEY   required
 *   CATALOG_ENRICH=1    enable full-catalog enrichment in sync (set in netlify.toml)
 *   CATALOG_ENRICH_MODEL  default claude-haiku-4-5
 *   CATALOG_ENRICH_BATCH  items per API call (default 20)
 */
const FORMALITY_TO_SCORE = {
  casual: 28,
  "smart-casual": 55,
  formal: 80,
  "black-tie": 95,
};

const FORMALITY_TO_BAND = {
  casual: "casual",
  "smart-casual": "smart",
  formal: "formal",
  "black-tie": "formal",
};

const COLOR_TO_PALETTE = {
  black: "Black",
  white: "Ivory / Cream",
  ivory: "Ivory / Cream",
  cream: "Ivory / Cream",
  grey: "Grey / Charcoal",
  gray: "Grey / Charcoal",
  charcoal: "Grey / Charcoal",
  navy: "Navy",
  blue: "Navy",
  brown: "Camel / Tan",
  tan: "Camel / Tan",
  camel: "Camel / Tan",
  beige: "Sand / Beige",
  sand: "Sand / Beige",
  khaki: "Sand / Beige",
  olive: "Olive",
  green: "Forest Green",
  burgundy: "Burgundy",
  red: "Bold Color",
  rust: "Rust / Terracotta",
};

const FIT_MAP = {
  fitted: "fitted",
  slim: "fitted",
  tailored: "fitted",
  relaxed: "relaxed",
  loose: "relaxed",
  oversized: "relaxed",
  regular: "straight",
  straight: "straight",
};

const SYSTEM = `You tag men's clothing products for a stylist app. Return STRICT JSON only:
{"items":[{"key":"...","formality":"casual|smart-casual|formal|black-tie","colors":["navy","grey"],"fit":"fitted|relaxed|regular","category":"blazer|shirt|trouser|shoe|belt|scarf|sunglasses|other","confidence":"high|medium|low","note":"optional short reason if low"}]}

Rules:
- formality: overall dressiness of THIS garment alone (not an outfit).
  casual = tees, hoodies, joggers, sneakers, cargo; smart-casual = chinos, polos, loafers; formal = blazers, dress shirts, dress trousers, dress shoes; black-tie = tuxedo / dinner jacket only.
- colors: 1–2 PRIMARY colors only (simple words: black, navy, grey, white, brown, tan, olive…). Ignore marketing color lists that name every option.
- fit: silhouette of the garment (fitted/slim/tailored → fitted; regular/straight → regular; relaxed/loose/oversized/wide → relaxed).
- category: MUST be one of: blazer, shirt, trouser, shoe, belt, scarf, sunglasses, other.
  Map hoodies/sweatshirts/tees/polos → shirt; shorts/joggers/chinos/cargos → trouser; sneakers/trainers → shoe; coats/overcoats/sport coats → blazer. Use other only if not clothing.
- Workwear (holster trousers, hi-vis, safety shoes) is casual, never formal.
- confidence: high when name is clear; medium when reasonable inference; low when name is vague/generic/ambiguous (e.g. "Mens Pant", "Jacket", nonsense SEO dump). NEVER invent attributes when unsure — set confidence=low instead.
- One result object per input key. No markdown.`;

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function normalizeColor(word) {
  const w = String(word || "").toLowerCase().trim();
  if (!w) return null;
  if (COLOR_TO_PALETTE[w]) return COLOR_TO_PALETTE[w];
  for (const [k, v] of Object.entries(COLOR_TO_PALETTE)) {
    if (w.includes(k)) return v;
  }
  return null;
}

function mapEnrichment(raw) {
  const formality = String(raw.formality || "").toLowerCase().trim();
  const fitRaw = String(raw.fit || "regular").toLowerCase().trim();
  const confidence = ["high", "medium", "low"].includes(String(raw.confidence || "").toLowerCase())
    ? String(raw.confidence).toLowerCase()
    : "low";
  const colorsIn = Array.isArray(raw.colors) ? raw.colors : [];
  const paletteTags = [...new Set(colorsIn.map(normalizeColor).filter(Boolean))].slice(0, 2);
  const category = String(raw.category || "other").toLowerCase().trim();
  const family = ["blazer", "shirt", "trouser", "shoe", "belt", "scarf", "sunglasses"].includes(category)
    ? category
    : null;

  return {
    formalityLabel: FORMALITY_TO_SCORE[formality] != null ? formality : null,
    formality: FORMALITY_TO_SCORE[formality] ?? null,
    formalityBand: FORMALITY_TO_BAND[formality] || null,
    colors: paletteTags,
    paletteTags: paletteTags.length ? paletteTags : undefined,
    cut: FIT_MAP[fitRaw] || "straight",
    fit: FIT_MAP[fitRaw] || "straight",
    categoryCorrected: category,
    family: family || undefined,
    type: family && !["belt", "scarf", "sunglasses"].includes(family) ? family : (family ? "accessory" : undefined),
    confidence,
    enrichmentNote: raw.note || null,
    enrichmentSource: "claude",
    enrichedAt: new Date().toISOString(),
  };
}

function applyEnrichmentToItem(item, enrich) {
  if (!item || !enrich) return item;
  const out = { ...item, enrichment: enrich };
  if (enrich.confidence === "low" || enrich.formality == null) {
    out.enrichmentConfidence = "low";
    out.enrichmentOk = false;
    return out;
  }
  out.enrichmentConfidence = enrich.confidence;
  out.enrichmentOk = true;
  out.formality = enrich.formality;
  out.formalityBand = enrich.formalityBand;
  out.formalityLabel = enrich.formalityLabel;
  out.cut = enrich.cut;
  out.fit = enrich.fit;
  if (enrich.paletteTags?.length) {
    out.paletteTags = enrich.paletteTags;
    out.colors = enrich.paletteTags;
  }
  if (enrich.family) {
    out.family = enrich.family;
    out.type = enrich.type || enrich.family;
  }
  if (enrich.categoryCorrected && enrich.categoryCorrected !== "other") {
    out.category = enrich.categoryCorrected;
    out.categoryRaw = item.category || null;
  }
  return out;
}

async function callClaudeBatch({ apiKey, model, batch }) {
  const userMsg = `Tag these ${batch.length} products:\n${JSON.stringify(batch.map((i) => ({
    key: i.key,
    name: i.name,
    brand: i.brand || i.retailer || null,
    category: i.category || null,
  })))}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: Math.min(4096, 120 * batch.length + 200),
      temperature: 0,
      system: SYSTEM,
      messages: [{ role: "user", content: userMsg }],
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Anthropic ${res.status}: ${errText.slice(0, 300)}`);
  }
  const data = await res.json();
  const text = (data.content || []).map((c) => c.text || "").join("").trim();
  const jsonStart = text.indexOf("{");
  const jsonEnd = text.lastIndexOf("}");
  if (jsonStart < 0 || jsonEnd < 0) throw new Error("No JSON in enrichment response");
  const parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1));
  const usage = data.usage || {};
  return {
    items: Array.isArray(parsed.items) ? parsed.items : [],
    usage: {
      inputTokens: usage.input_tokens || 0,
      outputTokens: usage.output_tokens || 0,
    },
  };
}

/**
 * Enrich items with Claude. Mutates copies; returns { items, stats }.
 * @param {object[]} items
 * @param {{ limit?: number, apiKey?: string, model?: string, batchSize?: number, onProgress?: Function }} opts
 */
async function enrichCatalogItems(items, opts = {}) {
  const apiKey = opts.apiKey || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      items,
      stats: { enriched: 0, skipped: items.length, reason: "missing_anthropic_key" },
    };
  }

  const model = opts.model || process.env.CATALOG_ENRICH_MODEL || "claude-haiku-4-5";
  const batchSize = Math.min(Math.max(Number(opts.batchSize || process.env.CATALOG_ENRICH_BATCH || 20), 5), 40);
  const limit = opts.limit != null ? Number(opts.limit) : items.length;
  const target = items.slice(0, limit);
  const byKey = new Map(target.map((i) => [i.key, { ...i }]));
  const batches = chunk(target, batchSize);

  let inputTokens = 0;
  let outputTokens = 0;
  let ok = 0;
  let low = 0;
  let failed = 0;

  for (let b = 0; b < batches.length; b += 1) {
    const batch = batches[b];
    try {
      const { items: tagged, usage } = await callClaudeBatch({ apiKey, model, batch });
      inputTokens += usage.inputTokens;
      outputTokens += usage.outputTokens;
      const taggedMap = new Map(tagged.map((t) => [t.key, t]));
      for (const item of batch) {
        const raw = taggedMap.get(item.key);
        if (!raw) {
          failed += 1;
          byKey.set(item.key, applyEnrichmentToItem(item, {
            confidence: "low",
            formalityLabel: null,
            formality: null,
            formalityBand: null,
            colors: [],
            cut: "straight",
            fit: "straight",
            categoryCorrected: "other",
            enrichmentNote: "missing from model response",
            enrichmentSource: "claude",
            enrichedAt: new Date().toISOString(),
          }));
          continue;
        }
        const enrich = mapEnrichment(raw);
        const applied = applyEnrichmentToItem(item, enrich);
        byKey.set(item.key, applied);
        if (applied.enrichmentOk) ok += 1;
        else low += 1;
      }
    } catch (err) {
      failed += batch.length;
      for (const item of batch) {
        byKey.set(item.key, applyEnrichmentToItem(item, {
          confidence: "low",
          formalityLabel: null,
          formality: null,
          formalityBand: null,
          colors: [],
          cut: "straight",
          fit: "straight",
          categoryCorrected: "other",
          enrichmentNote: String(err.message || err).slice(0, 120),
          enrichmentSource: "claude",
          enrichedAt: new Date().toISOString(),
        }));
      }
    }
    if (typeof opts.onProgress === "function") {
      opts.onProgress({
        batch: b + 1,
        batches: batches.length,
        ok,
        low,
        failed,
        inputTokens,
        outputTokens,
      });
    }
  }

  // Preserve original order; append any items beyond limit untouched
  const enrichedSlice = target.map((i) => byKey.get(i.key) || i);
  const rest = items.slice(limit);
  return {
    items: [...enrichedSlice, ...rest],
    stats: {
      model,
      batchSize,
      requested: target.length,
      enrichedOk: ok,
      enrichedLowConfidence: low,
      failed,
      inputTokens,
      outputTokens,
      estimatedUsd: estimateCostUsd(model, inputTokens, outputTokens),
    },
  };
}

function estimateCostUsd(model, inputTokens, outputTokens) {
  const m = String(model || "").toLowerCase();
  // Published Anthropic rates ($/MTok) — Haiku 4.5 / Sonnet 4.6 / Sonnet 5 intro
  let inRate = 1.0;
  let outRate = 5.0;
  if (m.includes("sonnet") && m.includes("5")) {
    inRate = 2.0;
    outRate = 10.0; // intro through Aug 2026
  } else if (m.includes("sonnet")) {
    inRate = 3.0;
    outRate = 15.0;
  } else if (m.includes("opus")) {
    inRate = 5.0;
    outRate = 25.0;
  }
  return Number((((inputTokens / 1e6) * inRate) + ((outputTokens / 1e6) * outRate)).toFixed(4));
}

/** Projected cost for a full catalog without calling the API. */
function estimateFullCatalogCost({ itemCount = 2500, batchSize = 20, model = "claude-haiku-4-5" } = {}) {
  const batches = Math.ceil(itemCount / batchSize);
  // Measured-ish averages for this prompt shape
  const systemTokens = 320;
  const perItemIn = 45;
  const overheadIn = 80;
  const perItemOut = 55;
  const inputPerBatch = systemTokens + overheadIn + (batchSize * perItemIn);
  const outputPerBatch = 40 + (batchSize * perItemOut);
  const inputTokens = batches * inputPerBatch;
  const outputTokens = batches * outputPerBatch;
  const standard = estimateCostUsd(model, inputTokens, outputTokens);
  return {
    model,
    itemCount,
    batchSize,
    batches,
    assumedInputTokens: inputTokens,
    assumedOutputTokens: outputTokens,
    estimatedUsdPerDay: standard,
    estimatedUsdPerDayBatchApi: Number((standard * 0.5).toFixed(4)),
    estimatedUsdPerMonth: Number((standard * 30).toFixed(2)),
    notes: [
      "Assumes re-enriching the full catalog every day (worst case).",
      "Incremental sync (only new/changed keys) would be much cheaper day-to-day.",
      "Batch API is ~50% off if we switch to Message Batches for the nightly job.",
      "Prompt caching of the system prompt would shave further ~10–20% on input.",
    ],
  };
}

function enrichmentEnabled() {
  return String(process.env.CATALOG_ENRICH || "").trim() === "1";
}

module.exports = {
  enrichCatalogItems,
  applyEnrichmentToItem,
  mapEnrichment,
  estimateFullCatalogCost,
  estimateCostUsd,
  enrichmentEnabled,
  FORMALITY_TO_SCORE,
  SYSTEM,
};
