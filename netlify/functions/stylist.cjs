/**
 * Netlify Function — Vestra stylist
 * Set ANTHROPIC_API_KEY in Netlify env to enable live Claude looks.
 * Modes:
 *   looks (default): { outfits: [3], source: "claude" }
 *   week: { outfits: [5 Mon–Fri], shoppingList: [...], mode: "week", source: "claude" }
 */
const SYSTEM_LOOKS = `You are Vestra, a real-world fashion stylist for people who may have NO style vocabulary.
You dress anyone for any occasion — wedding, gym-adjacent casual, first date, job interview, work dinner, weekend, travel, night out — using ONLY the provided catalog keys.

Return STRICT JSON:
{"outfits":[{"option":1,"styleFamily":"classy","items":["blazerNavy","shirt","trouserNavy","shoeBlack","beltAlt"],"rationale":"...","silhouette":"layered-tailored-belt"},{"option":2,"styleFamily":"modern","items":[...],"rationale":"...","silhouette":"..."},{"option":3,"styleFamily":"relaxed","items":[...],"rationale":"...","silhouette":"..."}]}

How to think (in order):
1. OCCASION / REQUEST FIRST — read the user's prompt. Infer formality (black-tie → gym-casual), silhouette (structured vs easy), and color mood (dark evening vs light daytime) from the REQUEST before using their Style DNA.
2. If the prompt is vague ("help me look good tonight", "dress me"), assume a versatile evening-smart look and offer THREE DIFFERENT formality levels (e.g. polished / modern / relaxed), not three clones.
3. Style DNA (archetype, fit, lifestyle, palette) is a LIGHT adjustment on top — nudge fabric ease, outerwear preference, and color bias. NEVER let DNA override a clear occasion (e.g. do not return quiet office looks for "wedding" or stiff tailoring for "gym" / "weekend nothing fussy").
4. Color theory: prefer harmony with their palette when it fits the occasion; still vary lightness/contrast across the 3 options. Never use olive/green unless those colors are in their palette.
5. Body/fit basics: honor fitted vs relaxed vs oversized as a soft preference, not a uniform.

Variety rules:
- Exactly 3 outfits with THREE DIFFERENT styleFamily values when the user did NOT name one mood.
- If they named a mood (streetwear, classy, sexy, modern, edgy…), keep ALL 3 in that mood but vary silhouette strings (outer on/off, trouser ease, accessory family).
- Never repeat the same item combination or silhouette across the 3 options.
- If avoidRecentItems / avoidSilhouettes are provided, do NOT reuse those catalog keys or silhouette strings unless the user is refining the same look.
- Each items array: ONLY catalog keys; at most one key per garment family (blazer*, shirt*, trouser*, shoe*, one accessory).
- Rationale: 1–2 plain sentences naming occasion + formality. NEVER write catalog keys like shirtAlt.
- No markdown outside JSON.`;

const SYSTEM_WEEK = `You are Vestra, building a Mon–Fri wardrobe plan with real range (classy, modern, relaxed, sexy Friday, etc.).
You ONLY use the provided catalog keys.
Return STRICT JSON:
{"outfits":[{"day":"Monday","option":1,"styleFamily":"classy","items":["blazerNavy","shirt","trouserNavy","shoeBlack","beltAlt"],"rationale":"...","silhouette":"layered-tailored-belt"},{"day":"Tuesday","option":2,"items":[...],"rationale":"...","silhouette":"..."},{"day":"Wednesday","option":3,"items":[...],"rationale":"...","silhouette":"..."},{"day":"Thursday","option":4,"items":[...],"rationale":"...","silhouette":"..."},{"day":"Friday","option":5,"items":[...],"rationale":"...","silhouette":"..."}],"shoppingList":[{"key":"blazerNavy","reason":"Anchors Mon/Thu tailored days"}]}
Rules:
- Exactly 5 outfits — Monday through Friday.
- Each day needs a DISTINCT silhouette string (outer vs open + tailored/structured/relaxed + accessory family).
- Rotate styleFamily across the week.
- Request text and workweek formality drive the plan; Style DNA is a light nudge only.
- If avoidRecentItems are provided, minimize reusing those keys.
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
    if (s.startsWith("blazer")) return "blazer";
    if (s.startsWith("shirt")) return "shirt";
    if (s.startsWith("trouser")) return "trouser";
    if (s.startsWith("shoe")) return "shoe";
    if (s.startsWith("belt")) return "belt";
    if (s.startsWith("scarf")) return "scarf";
    if (s.startsWith("sunglasses")) return "sunglasses";
    return null;
  };
  const families = items.map(fam).filter(Boolean);
  const hasOuter = families.includes("blazer");
  const acc = families.find((f) => ["belt", "scarf", "sunglasses"].includes(f)) || "none";
  const trouser = items.find((k) => fam(k) === "trouser") || "";
  const shirt = items.find((k) => fam(k) === "shirt") || "";
  const bottom = String(trouser).includes("Alt") ? "ease" : "straight";
  const top = String(shirt).includes("Alt") ? "soft" : "crisp";
  return `${hasOuter ? "layered" : "open"}-${top}-${bottom}-${acc}`;
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
    avoidRecentItems = [],
    avoidSilhouettes = [],
  } = body;
  if (!prompt || !catalogKeys.length) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "prompt and catalogKeys required" }) };
  }

  const week = isWeekMode(body);
  const system = week ? SYSTEM_WEEK : SYSTEM_LOOKS;
  const avoidBlock = [
    avoidRecentItems?.length ? `Avoid reusing these catalog keys from recent looks: ${avoidRecentItems.join(", ")}` : "",
    avoidSilhouettes?.length ? `Avoid these silhouette strings: ${avoidSilhouettes.join(", ")}` : "",
  ].filter(Boolean).join("\n");

  const userMsg = week
    ? `Language: ${lang}
User prompt (OCCASION FIRST): ${prompt}
Style DNA profile (light adjustment only): ${JSON.stringify(profile)}
Catalog keys (use only these): ${catalogKeys.join(", ")}
${avoidBlock}
Return a Mon–Fri week wardrobe plan: exactly 5 outfits with distinct silhouettes, plus one shoppingList, as JSON.`
    : `Language: ${lang}
User prompt (OCCASION / REQUEST FIRST — this drives formality & silhouette): ${prompt}
Style DNA profile (light adjustment only — do not let it override the request): ${JSON.stringify(profile)}
Catalog keys (use only these): ${catalogKeys.join(", ")}
${avoidBlock}
Reason like a stylist for someone who may not know how to dress. Return 3 varied outfits as JSON.`;

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
    const allowed = new Set(catalogKeys);
    const want = week ? 5 : 3;
    const usedSilhouettes = new Set();
    const avoidSil = new Set(avoidSilhouettes || []);
    const outfits = (parsed.outfits || [])
      .slice(0, want)
      .map((o, i) => {
        const items = (o.items || []).filter((k) => allowed.has(k));
        const silhouette = o.silhouette || silhouetteOf(items);
        return {
          id: `claude-${week ? "week-" : ""}${Date.now()}-${i}`,
          option: o.option || i + 1,
          day: week ? (o.day || WEEK_DAYS[i]) : undefined,
          items,
          rationale: o.rationale || "",
          silhouette,
          styleFamily: o.styleFamily,
        };
      })
      .filter((o) => {
        if (o.items.length < 3) return false;
        if (!week) {
          if (avoidSil.has(o.silhouette) && usedSilhouettes.size === 0) {
            /* allow if we have nothing else, but prefer fresh */
          }
          if (usedSilhouettes.has(o.silhouette)) return false;
          usedSilhouettes.add(o.silhouette);
          return true;
        }
        if (usedSilhouettes.has(o.silhouette)) return false;
        usedSilhouettes.add(o.silhouette);
        return true;
      });

    if (!outfits.length) {
      return { statusCode: 502, headers, body: JSON.stringify({ error: "Empty outfits after filter" }) };
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
