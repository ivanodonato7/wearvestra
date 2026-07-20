/**
 * Netlify Function — Vestra stylist
 * Set ANTHROPIC_API_KEY in Netlify env to enable live Claude looks.
 *
 * Catalog arrives as product cards (name, family, colors, cut, formality) so the
 * model can coordinate outfits — not bare stub keys from the old fictional catalog.
 */
const SYSTEM_LOOKS = `You are Vestra, a men's stylist for guys who do NOT already know how to dress.
They will trust your picks completely. A bad combination is a core failure — not a minor miss.
You ONLY use catalog product keys from the provided list.

Return STRICT JSON (no markdown):
{"outfits":[{"option":1,"styleFamily":"classy","items":["aw-1","aw-2","aw-3","aw-4"],"whyThisWorks":"Navy blazer keeps this formal enough for a wedding; ivory shirt keeps it from feeling heavy.","silhouette":"layered-fitted-straight","rationale":"Navy blazer keeps this formal enough for a wedding; ivory shirt keeps it from feeling heavy."},{"option":2,"styleFamily":"modern","items":[...],"whyThisWorks":"...","silhouette":"...","rationale":"..."},{"option":3,"styleFamily":"relaxed","items":[...],"whyThisWorks":"...","silhouette":"...","rationale":"..."}]}

════════════════════════════════════════
STYLIST RULES (hard — never break)
════════════════════════════════════════

1) FORMALITY MUST MATCH ACROSS EVERY PIECE
   Read each product's formality (0=active → 100=black-tie), formalityBand, and name.
   Every piece in an outfit must sit in the SAME formality band for the occasion.
   - Wedding / funeral / black-tie: ONLY tailored / dress pieces (blazer or suit jacket, dress shirt, dress trousers/chinos, dress shoes). NEVER cargo, joggers, gym shorts, hoodies, sneakers, ripped denim, novelty tees.
   - Job interview / office: smart business (blazer preferred + dress shirt or sharp knit + chinos/trousers + dress shoes). No cargo, gym, sneakers.
   - First date / dinner: smart-evening (polished; blazer or elevated knit OK). No gym gear, cargo, athletic shorts.
   - Gym / workout: ONLY active/athleisure (hoodie/tee, joggers/shorts, sneakers). NEVER blazer, suit, dress shoes, loafers.
   - Weekend casual: easy everyday. No tuxedo / black-tie / shiny patent prom shoes.
   If formalityTarget is provided, stay inside that window for EVERY item.

2) COLOR COORDINATION (max 2–3 main colors)
   Use the colors[] field on each product card.
   - An outfit may use at most 2–3 distinct main colors.
   - Anchor with neutrals: navy, grey, black, white/ivory, tan/camel, sand.
   - At most ONE bolder/accent color; every other piece should be neutral.
   - Do NOT combine two loud accents (e.g. red + bright green).
   - Prefer pieces that share a color or sit on a neutral base.

3) SILHOUETTE BALANCE
   Use the cut field: fitted | straight | relaxed.
   - Pair a fitted top with a relaxed/straight bottom, OR a relaxed top with a fitted/straight bottom.
   - Avoid all-fitted stacks AND all-loose stacks unless the user explicitly asked for that mood (e.g. streetwear oversized).
   - One clear silhouette story per look (outer on/off is fine for variety across the 3 options).

4) ONE KEY PER GARMENT FAMILY
   At most one of: blazer, shirt, trouser, shoe, and one accessory (belt|scarf|sunglasses).
   items[] must be catalog keys only.

5) WHY THIS WORKS (required)
   whyThisWorks AND rationale must be the SAME single plain sentence (≤160 chars).
   Explain coordination in human words — name garments/colors/formality, NEVER catalog keys.
   Good: "Navy blazer keeps this formal enough for a wedding; ivory shirt keeps it from feeling heavy."
   Bad: "Looks nice." / "aw-123 with shirtAlt."
   If you cannot write a honest whyThisWorks for the combo, the outfit is wrong — rebuild it.

6) STYLE DNA is a LIGHT nudge only (fit ease, palette bias). Never override a clear occasion.

════════════════════════════════════════
VARIETY
════════════════════════════════════════
- Exactly 3 outfits.
- Different styleFamily values when the user did not name one mood.
- If they named a mood, keep all 3 in that mood but vary silhouette.
- Never repeat the same item set or silhouette string.
- Honor avoidRecentItems / avoidSilhouettes when provided.`;

const SYSTEM_WEEK = `You are Vestra, building a men's Mon–Fri wardrobe plan.
Same hard stylist rules as single looks: formality coherence across every piece, ≤2–3 colors with neutral anchors, silhouette balance (fitted↔relaxed), and a one-line whyThisWorks per day.
ONLY use provided catalog keys.
Return STRICT JSON:
{"outfits":[{"day":"Monday","option":1,"styleFamily":"classy","items":["aw-1","aw-2","aw-3","aw-4"],"whyThisWorks":"...","rationale":"...","silhouette":"layered-fitted-belt"},{"day":"Tuesday","option":2,"items":[...],"whyThisWorks":"...","rationale":"...","silhouette":"..."},{"day":"Wednesday","option":3,"items":[...],"whyThisWorks":"...","rationale":"...","silhouette":"..."},{"day":"Thursday","option":4,"items":[...],"whyThisWorks":"...","rationale":"...","silhouette":"..."},{"day":"Friday","option":5,"items":[...],"whyThisWorks":"...","rationale":"...","silhouette":"..."}],"shoppingList":[{"key":"aw-1","reason":"Anchors Mon/Thu tailored days"}]}
Rules:
- Exactly 5 outfits, Mon–Fri, distinct silhouettes.
- whyThisWorks = rationale = one coordination sentence each day.
- No cargo on formal days; no blazers on gym-adjacent asks.
- Catalog keys only; one key per garment family per look.
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

function silhouetteOf(items, byKey) {
  const famOf = (k) => {
    const meta = byKey?.get?.(k);
    if (meta?.family) return meta.family;
    const s = String(k || "");
    if (s.startsWith("blazer")) return "blazer";
    if (s.startsWith("shirt")) return "shirt";
    if (s.startsWith("trouser")) return "trouser";
    if (s.startsWith("shoe")) return "shoe";
    if (s.startsWith("belt")) return "belt";
    if (s.startsWith("scarf")) return "scarf";
    if (s.startsWith("sunglasses")) return "sunglasses";
    return "live";
  };
  const cuts = items.map((k) => byKey?.get?.(k)?.cut || "straight");
  const families = items.map(famOf).filter(Boolean);
  const hasOuter = families.includes("blazer");
  const acc = families.find((f) => ["belt", "scarf", "sunglasses"].includes(f)) || "none";
  const topCut = cuts[families.indexOf("shirt")] || cuts[families.indexOf("blazer")] || "straight";
  const bottomCut = cuts[families.indexOf("trouser")] || "straight";
  return `${hasOuter ? "layered" : "open"}-${topCut}-${bottomCut}-${acc}`;
}

function formatCatalogForPrompt(catalogKeys, catalogItems) {
  if (Array.isArray(catalogItems) && catalogItems.length) {
    return catalogItems.map((i) => {
      const colors = Array.isArray(i.colors) ? i.colors.join("/") : "";
      const parts = [
        i.key,
        i.name ? `"${String(i.name).slice(0, 72)}"` : null,
        i.family ? `family=${i.family}` : null,
        colors ? `colors=${colors}` : null,
        i.cut ? `cut=${i.cut}` : null,
        Number.isFinite(i.formality) ? `formality=${i.formality}` : null,
        i.formalityBand ? `band=${i.formalityBand}` : null,
        i.isNeutral ? "neutral=yes" : null,
        i.brand ? `brand=${i.brand}` : null,
        i.category ? `cat=${String(i.category).slice(0, 28)}` : null,
      ].filter(Boolean);
      return `- ${parts.join(" | ")}`;
    }).join("\n");
  }
  return (catalogKeys || []).join(", ");
}

function itemBlockedByTarget(item, target) {
  if (!item || !target) return false;
  const blob = [item.name, item.category, item.family, item.brand, ...(item.colors || [])].filter(Boolean).join(" ");
  if (typeof target.hardBan === "string" && target.hardBan) {
    try {
      if (new RegExp(target.hardBan, "i").test(blob)) return true;
    } catch { /* ignore */ }
  }
  if (target.hardBan && target.hardBan.source) {
    try {
      if (new RegExp(target.hardBan.source, target.hardBan.flags || "i").test(blob)) return true;
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

function normalizeWhy(o) {
  const why = String(o.whyThisWorks || o.rationale || "").trim();
  return why.slice(0, 200);
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
    ? `Formality target: label=${target.label}, prefer≈${target.prefer}, window ${target.min}-${target.max}. hardBan=${target.hardBan || "none"}. requireOuter=${!!target.requireOuter}, forbidOuter=${!!target.forbidOuter}. EVERY item must fit this window.`
    : "";

  const userMsg = week
    ? `Language: ${lang}
User prompt (OCCASION FIRST): ${prompt}
Style DNA (light nudge only): ${JSON.stringify(profile)}
${targetBlock}
Catalog products (reason from name/colors/cut/formality — use ONLY these keys):
${catalogBlock}
${avoidBlock}
Return a Mon–Fri plan: 5 coordinated outfits with whyThisWorks each, plus shoppingList, as JSON.`
    : `Language: ${lang}
User prompt (OCCASION FIRST — drives formality): ${prompt}
Style DNA (light nudge only — do not override occasion): ${JSON.stringify(profile)}
${targetBlock}
Catalog products (full cards — coordinate formality + color + cut; use ONLY these keys):
${catalogBlock}
${avoidBlock}
Build 3 coordinated outfits for someone who does not know how to dress. Each needs an honest whyThisWorks sentence. Return JSON.`;

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
        max_tokens: week ? 2400 : 1600,
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
        const why = normalizeWhy(o);
        const silhouette = o.silhouette || silhouetteOf(items, byKey);
        const recentHits = items.reduce((n, k) => n + (avoidItems.has(k) ? 1 : 0), 0);
        return {
          id: `claude-${week ? "week-" : ""}${Date.now()}-${i}`,
          option: o.option || i + 1,
          day: week ? (o.day || WEEK_DAYS[i]) : undefined,
          items,
          rationale: why,
          whyThisWorks: why,
          silhouette,
          styleFamily: o.styleFamily,
          recentHits,
          avoidedSil: avoidSil.has(silhouette),
        };
      })
      .filter((o) => o.items.length >= 3 && o.whyThisWorks);

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

    const fresh = mapped.filter((o) => !o.avoidedSil && o.recentHits === 0);
    const soft = mapped.filter((o) => !o.avoidedSil);
    const any = mapped;

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
        body: JSON.stringify({ error: `Need ${want} coordinated outfits with whyThisWorks, got ${outfits.length}` }),
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
