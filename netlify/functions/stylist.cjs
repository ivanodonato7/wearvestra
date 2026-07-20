/**
 * Netlify Function — Vestra stylist
 * Set ANTHROPIC_API_KEY in Netlify env to enable live Claude looks.
 * Modes:
 *   looks (default): { outfits: [3], source: "claude" }
 *   week: { outfits: [5 Mon–Fri], shoppingList: [...], mode: "week", source: "claude" }
 *
 * Catalog may arrive as bare keys (legacy) or rich product cards with name /
 * category / formality so the model can reason about occasion appropriateness
 * against the real Awin feed (not fictional stub buckets).
 */
const SYSTEM_LOOKS = `You are Vestra, a real-world men's fashion stylist for guys who may have NO style vocabulary.
You dress men for any occasion — wedding, gym, first date, job interview, funeral, work dinner, weekend casual — using ONLY the provided catalog product keys.

Return STRICT JSON:
{"outfits":[{"option":1,"styleFamily":"classy","items":["aw-123","aw-456","aw-789","aw-012"],"rationale":"...","silhouette":"layered-tailored-belt"},{"option":2,"styleFamily":"modern","items":[...],"rationale":"...","silhouette":"..."},{"option":3,"styleFamily":"relaxed","items":[...],"rationale":"...","silhouette":"..."}]}

How to think (in order):
1. OCCASION / FORMALITY FIRST — read the user's prompt AND each product's name, category, and formality score (0=active → 100=black-tie). Infer what is appropriate BEFORE Style DNA.
2. HARD RULES (never break these):
   - Wedding / funeral / black-tie: ONLY tailored / dress pieces (suits, blazers, dress shirts, dress trousers, dress shoes). NEVER cargo pants, joggers, gym shorts, hoodies, sneakers, ripped denim.
   - Gym / workout / athletic: ONLY active or athleisure (hoodies, joggers, tees, shorts, trainers). NEVER blazers, suits, dress shoes, loafers.
   - Job interview / office: smart / business (blazer or sharp shirt + chinos/trousers + dress shoes). No cargo, gym, or street-hype pieces.
   - First date / dinner: smart-evening (polished but not black-tie). No gym gear or cargo.
   - Weekend casual: easy everyday. No tuxedo / black-tie.
3. Prefer products whose formalityBand / formality number sits in the formalityTarget window when provided.
4. Style DNA is a LIGHT nudge only — never override a clear occasion.
5. Color theory: prefer harmony with their palette; never force olive/green unless in palette.

Variety rules:
- Exactly 3 outfits with THREE DIFFERENT styleFamily values when the user did NOT name one mood.
- If they named a mood, keep ALL 3 in that mood but vary silhouette.
- Never repeat the same item combination or silhouette across the 3 options.
- Each items array: ONLY catalog keys from the provided list; at most one key per garment family (blazer, shirt, trouser, shoe, one accessory).
- Rationale: 1–2 plain sentences naming occasion + formality. NEVER write raw catalog keys.
- No markdown outside JSON.`;

const SYSTEM_WEEK = `You are Vestra, building a men's Mon–Fri wardrobe plan with real range (classy, modern, relaxed, sexy Friday, etc.).
You ONLY use the provided catalog product keys. Respect each product's name/category/formality — never put cargo pants on a formal day or blazers on an active day.
Return STRICT JSON:
{"outfits":[{"day":"Monday","option":1,"styleFamily":"classy","items":["aw-1","aw-2","aw-3","aw-4"],"rationale":"...","silhouette":"layered-tailored-belt"},{"day":"Tuesday","option":2,"items":[...],"rationale":"...","silhouette":"..."},{"day":"Wednesday","option":3,"items":[...],"rationale":"...","silhouette":"..."},{"day":"Thursday","option":4,"items":[...],"rationale":"...","silhouette":"..."},{"day":"Friday","option":5,"items":[...],"rationale":"...","silhouette":"..."}],"shoppingList":[{"key":"aw-1","reason":"Anchors Mon/Thu tailored days"}]}
Rules:
- Exactly 5 outfits — Monday through Friday.
- Each day needs a DISTINCT silhouette string.
- Rotate styleFamily across the week.
- Request text and workweek formality drive the plan; Style DNA is a light nudge only.
- Catalog keys only; one key per garment family per look.
- shoppingList: unique keys used across the week with short reasons.
- Rationale: plain garment words, never catalog keys.
- No markdown outside JSON.`;

function isWeekMode(body) {
  if (body?.mode === "week") return true;
  const prompt = String(body?.prompt || "").toLowerCase();
  return (
    /\bweek\s*wardrobe\b/.test(prompt)
    || /\bplan\s+my\s+week\b/.test(prompt)
    || /\b5\s+looks\b/.test(prompt)
    || /\bmon(?:day)?\s*[-–—]\s*fri(?:day)?\b/.test(prompt)
    || /\bplanifica\s+mi\s+semana\b/.test(prompt)
    || /\bplanifier\s+ma\s+semaine\b/.test(prompt)
  );
}

const WEEK_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

function silhouetteOf(items) {
  const fam = (k) => {
    const s = String(k || "");
    if (s.startsWith("blazer") || s.includes("blazer")) return "blazer";
    if (s.startsWith("shirt") || s.includes("shirt")) return "shirt";
    if (s.startsWith("trouser") || s.includes("trouser")) return "trouser";
    if (s.startsWith("shoe") || s.includes("shoe")) return "shoe";
    if (s.startsWith("belt")) return "belt";
    if (s.startsWith("scarf")) return "scarf";
    if (s.startsWith("sunglasses")) return "sunglasses";
    if (/^aw-/i.test(s) || /^ss-/i.test(s)) return "live";
    return null;
  };
  const families = items.map(fam).filter(Boolean);
  const hasOuter = families.includes("blazer");
  const acc = families.find((f) => ["belt", "scarf", "sunglasses"].includes(f)) || "none";
  return `${hasOuter ? "layered" : "open"}-${families.join("-") || "mix"}-${acc}`;
}

function formatCatalogForPrompt(catalogKeys, catalogItems) {
  if (Array.isArray(catalogItems) && catalogItems.length) {
    return catalogItems.map((i) => {
      const parts = [
        i.key,
        i.name ? `"${String(i.name).slice(0, 80)}"` : null,
        i.family ? `family=${i.family}` : null,
        i.category ? `cat=${String(i.category).slice(0, 40)}` : null,
        i.brand ? `brand=${i.brand}` : null,
        Number.isFinite(i.formality) ? `formality=${i.formality}` : null,
        i.formalityBand ? `band=${i.formalityBand}` : null,
      ].filter(Boolean);
      return `- ${parts.join(" | ")}`;
    }).join("\n");
  }
  return (catalogKeys || []).join(", ");
}

/** Server-side hard filter when formalityTarget + catalogItems are available. */
function itemBlockedByTarget(item, target) {
  if (!item || !target) return false;
  const blob = [item.name, item.category, item.family, item.brand].filter(Boolean).join(" ");
  if (target.hardBan && new RegExp(target.hardBan.source || target.hardBan, target.hardBan.flags || "i").test(blob)) {
    return true;
  }
  // Serialized regex from JSON arrives as {source, flags} or plain string
  if (typeof target.hardBan === "string" && target.hardBan) {
    try {
      if (new RegExp(target.hardBan, "i").test(blob)) return true;
    } catch { /* ignore */ }
  }
  if (target.forbidOuter && item.family === "blazer") return true;
  if (Number.isFinite(item.formality) && Number.isFinite(target.min) && Number.isFinite(target.max)) {
    if (item.formality < target.min - 10 || item.formality > target.max + 10) return true;
  }
  return false;
}

function serializeTarget(target) {
  if (!target) return null;
  return {
    ...target,
    hardBan: target.hardBan instanceof RegExp
      ? target.hardBan.source
      : (typeof target.hardBan === "string" ? target.hardBan : null),
  };
}

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "POST only" }) };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { statusCode: 503, headers, body: JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  const {
    prompt,
    profile = {},
    lang = "en",
    catalogKeys = [],
    catalogItems = [],
    formalityTarget = null,
    avoidRecentItems = [],
    avoidSilhouettes = [],
  } = body;

  const keys = catalogKeys.length
    ? catalogKeys
    : (catalogItems || []).map((i) => i.key).filter(Boolean);
  if (!prompt || !keys.length) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "prompt and catalogKeys/catalogItems required" }) };
  }

  const byKey = new Map((catalogItems || []).map((i) => [i.key, i]));
  const target = serializeTarget(formalityTarget);
  const week = isWeekMode(body);
  const system = week ? SYSTEM_WEEK : SYSTEM_LOOKS;
  const avoidBlock = [
    avoidRecentItems?.length ? `Avoid reusing these catalog keys from recent looks: ${avoidRecentItems.join(", ")}` : "",
    avoidSilhouettes?.length ? `Avoid these silhouette strings: ${avoidSilhouettes.join(", ")}` : "",
  ].filter(Boolean).join("\n");

  const catalogBlock = formatCatalogForPrompt(keys, catalogItems);
  const targetBlock = target
    ? `Formality target for this request: label=${target.label}, prefer≈${target.prefer}, window ${target.min}-${target.max}. hardBan pattern: ${target.hardBan || "none"}. requireOuter=${!!target.requireOuter}, forbidOuter=${!!target.forbidOuter}. REJECT any product that matches hardBan or sits far outside the window.`
    : "";

  const userMsg = week
    ? `Language: ${lang}
User prompt (OCCASION FIRST): ${prompt}
Style DNA profile (light adjustment only): ${JSON.stringify(profile)}
${targetBlock}
Catalog products (use ONLY these keys — reason from name/category/formality):
${catalogBlock}
${avoidBlock}
Return a Mon–Fri week wardrobe plan: exactly 5 outfits with distinct silhouettes, plus one shoppingList, as JSON.`
    : `Language: ${lang}
User prompt (OCCASION / REQUEST FIRST — this drives formality & silhouette): ${prompt}
Style DNA profile (light adjustment only — do not let it override the request): ${JSON.stringify(profile)}
${targetBlock}
Catalog products (use ONLY these keys — reason from name/category/formality):
${catalogBlock}
${avoidBlock}
Reason like a stylist. Wedding ≠ cargo. Gym ≠ blazer. Return 3 varied outfits as JSON.`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: week ? 2200 : 1400,
        system,
        messages: [{ role: "user", content: userMsg }],
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      return { statusCode: 502, headers, body: JSON.stringify({ error: "Anthropic error", detail: errText.slice(0, 400) }) };
    }
    const data = await res.json();
    const text = (data.content || []).map((c) => c.text || "").join("").trim();
    const jsonStart = text.indexOf("{");
    const jsonEnd = text.lastIndexOf("}");
    if (jsonStart < 0 || jsonEnd < 0) {
      return { statusCode: 502, headers, body: JSON.stringify({ error: "No JSON in model response" }) };
    }
    const parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1));
    const allowed = new Set(keys);
    const want = week ? 5 : 3;
    const avoidSil = new Set(avoidSilhouettes || []);
    const avoidItems = new Set(avoidRecentItems || []);

    const mapped = (parsed.outfits || [])
      .map((o, i) => {
        const items = (o.items || []).filter((k) => {
          if (!allowed.has(k)) return false;
          const meta = byKey.get(k);
          if (meta && target && itemBlockedByTarget(meta, formalityTarget || target)) return false;
          return true;
        });
        const silhouette = o.silhouette || silhouetteOf(items);
        const recentHits = items.reduce((n, k) => n + (avoidItems.has(k) ? 1 : 0), 0);
        return {
          id: `claude-${week ? "week-" : ""}${Date.now()}-${i}`,
          option: o.option || i + 1,
          day: week ? (o.day || WEEK_DAYS[i]) : undefined,
          items,
          rationale: o.rationale || "",
          silhouette,
          styleFamily: o.styleFamily,
          recentHits,
          avoidedSil: avoidSil.has(silhouette),
        };
      })
      .filter((o) => o.items.length >= 3);

    const pickUnique = (pool, limit) => {
      const out = [];
      const used = new Set();
      for (const o of pool) {
        if (out.length >= limit) break;
        if (used.has(o.silhouette)) continue;
        used.add(o.silhouette);
        out.push(o);
      }
      return out;
    };

    const fresh = mapped
      .filter((o) => !o.avoidedSil && o.recentHits === 0)
      .sort((a, b) => a.recentHits - b.recentHits);
    const soft = mapped
      .filter((o) => !o.avoidedSil)
      .sort((a, b) => a.recentHits - b.recentHits);
    const any = mapped.sort((a, b) => (a.avoidedSil - b.avoidedSil) || (a.recentHits - b.recentHits));

    let outfits = pickUnique(fresh, want);
    if (outfits.length < want) {
      const used = new Set(outfits.map((o) => o.silhouette));
      for (const o of pickUnique(soft, want)) {
        if (outfits.length >= want) break;
        if (used.has(o.silhouette)) continue;
        used.add(o.silhouette);
        outfits.push(o);
      }
    }
    if (outfits.length < want) {
      const used = new Set(outfits.map((o) => o.silhouette));
      for (const o of pickUnique(any, want)) {
        if (outfits.length >= want) break;
        if (used.has(o.silhouette)) continue;
        used.add(o.silhouette);
        outfits.push(o);
      }
    }

    outfits = outfits.slice(0, want).map(({ recentHits, avoidedSil, ...o }, i) => ({
      ...o,
      option: o.option || i + 1,
      day: week ? (o.day || WEEK_DAYS[i]) : undefined,
    }));

    if (outfits.length < want) {
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({ error: `Need ${want} outfits, got ${outfits.length}` }),
      };
    }

    const shoppingList = week
      ? (Array.isArray(parsed.shoppingList) ? parsed.shoppingList : [])
        .map((row) => (typeof row === "string" ? { key: row, reason: "" } : { key: row.key, reason: row.reason || "" }))
        .filter((row) => allowed.has(row.key))
      : undefined;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        outfits,
        shoppingList,
        mode: week ? "week" : "looks",
        source: "claude",
      }),
    };
  } catch (err) {
    return {
      statusCode: 502,
      headers,
      body: JSON.stringify({ error: String(err.message || err) }),
    };
  }
};
