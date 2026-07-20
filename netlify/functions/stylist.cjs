/**
 * Netlify Function — Vestra stylist
 * Set ANTHROPIC_API_KEY in Netlify env to enable live Claude looks.
 * Modes:
 *   looks (default): { outfits: [3], source: "claude" }
 *   week: { outfits: [5 Mon–Fri], shoppingList: [...], mode: "week", source: "claude" }
 */
const SYSTEM_LOOKS = `You are Vestra, a precise men's fashion stylist for EVERY style — streetwear, classy/elegant, sexy/evening, modern/sharp, edgy, romantic, minimal, bold, and relaxed.
You ONLY dress men using the provided catalog keys.
Return STRICT JSON with this shape:
{"outfits":[{"option":1,"styleFamily":"streetwear","items":["shirtAlt","trouserAlt","shoeAlt","sunglassesAlt"],"rationale":"..."},{"option":2,"styleFamily":"classy","items":[...],"rationale":"..."},{"option":3,"styleFamily":"sexy","items":[...],"rationale":"..."}]}
Rules:
- Exactly 3 outfits.
- The 3 outfits MUST use THREE DIFFERENT styleFamily values from: streetwear, classy, sexy, modern, edgy, romantic, minimal, bold, relaxed.
- If the user asks for a specific mood (streetwear, classy, sexy, modern, edgy…), make option 1 match that mood strongly; still vary options 2–3 into adjacent but distinct families.
- Streetwear: no stiff boardroom vibe — prefer Alt/easy pieces, sunglasses, often no blazer or a soft blazerAlt. Tag styleFamily "streetwear".
- Classy/elegant: tailored blazer + clean shirt + straight trousers + refined shoe/belt or scarf. Tag styleFamily "classy".
- Sexy/evening: darker keys (blazerBlack, trouserBlack, shoeBlack, scarfBurgundy), sharper lines, date/night energy. Tag styleFamily "sexy".
- Modern: crisp structured shapes, navy/black accents, intentional and contemporary. Tag styleFamily "modern".
- Edgy: high contrast, black-forward, attitude without costume. Tag styleFamily "edgy".
- When the user names a mood, ALL 3 outfits should use that styleFamily (vary silhouettes within the genre).
- Each items array uses ONLY keys from the catalog list.
- Include at most one key per garment family (blazer*, shirt*, trouser*, shoe*, and one accessory family).
- Honor the user's palette colors — never choose olive/green pieces unless Olive or Forest Green is in their palette. Sexy/edgy may lean black/navy when those fit the palette or prompt.
- Honor archetype, fit, lifestyle, budget, and occasions — but NEVER collapse every look into the same quiet-tailored uniform.
- Rationale: 1–2 sentences, name the style family and their colors.
- Rationale MUST use plain garment words (blazer, shirt, trousers, boots, sunglasses). NEVER write catalog keys like shirtAlt, trouserAlt, shoeAlt, blazerNavy, sunglassesAlt.
- No markdown, no prose outside JSON.`;

const SYSTEM_WEEK = `You are Vestra, a precise men's fashion stylist building a weekday wardrobe plan that still spans real style range (classy, modern, relaxed, sexy Friday, etc.).
You ONLY dress men using the provided catalog keys.
Return STRICT JSON with this shape:
{"outfits":[{"day":"Monday","option":1,"styleFamily":"classy","items":["blazerNavy","shirt","trouserNavy","shoeBlack","beltAlt"],"rationale":"...","silhouette":"layered-tailored-belt"},{"day":"Tuesday","option":2,"items":[...],"rationale":"...","silhouette":"..."},{"day":"Wednesday","option":3,"items":[...],"rationale":"...","silhouette":"..."},{"day":"Thursday","option":4,"items":[...],"rationale":"...","silhouette":"..."},{"day":"Friday","option":5,"items":[...],"rationale":"...","silhouette":"..."}],"shoppingList":[{"key":"blazerNavy","reason":"Anchors Mon/Thu tailored days"}]}
Rules:
- Exactly 5 outfits — Monday through Friday in order.
- Each day needs a DISTINCT silhouette. Silhouette = outer vs open + structure (tailored/structured/relaxed) + accessory family (belt/scarf/sunglasses/none). No two days may share the same silhouette string.
- Rotate styleFamily across the week (e.g. classy, modern, minimal, relaxed, sexy) so it does not feel like five clones.
- Vary presence of blazer, trouser ease, and accessory so the week does not feel repetitive.
- Each items array uses ONLY keys from the catalog list.
- Include at most one key per garment family (blazer*, shirt*, trouser*, shoe*, and one accessory family).
- Honor the user's palette colors — never choose olive/green pieces unless Olive or Forest Green is in their palette.
- Bias toward workweek polish unless the prompt asks for streetwear/sexy/etc.
- shoppingList: one consolidated list of UNIQUE catalog keys needed across the week (every key used in any outfit, each once), with a short reason.
- Rationale: 1 sentence tying the day + style family to their profile.
- Rationale MUST use plain garment words. NEVER write catalog keys like shirtAlt, trouserAlt, shoeAlt, blazerNavy.
- No markdown, no prose outside JSON.`;

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

  const { prompt, profile = {}, lang = "en", catalogKeys = [] } = body;
  if (!prompt || !catalogKeys.length) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "prompt and catalogKeys required" }) };
  }

  const week = isWeekMode(body);
  const system = week ? SYSTEM_WEEK : SYSTEM_LOOKS;
  const userMsg = week
    ? `Language: ${lang}
User prompt: ${prompt}
Profile JSON: ${JSON.stringify(profile)}
Catalog keys (use only these): ${catalogKeys.join(", ")}
Return a Mon–Fri weekwardrobe plan: exactly 5 outfits with distinct silhouettes, plus one shoppingList, as JSON.`
    : `Language: ${lang}
User prompt: ${prompt}
Profile JSON: ${JSON.stringify(profile)}
Catalog keys (use only these): ${catalogKeys.join(", ")}
Return 3 outfits as JSON.`;

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
        max_tokens: week ? 2200 : 1200,
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
        };
      })
      .filter((o) => {
        if (o.items.length < 3) return false;
        if (!week) return true;
        if (usedSilhouettes.has(o.silhouette)) return false;
        usedSilhouettes.add(o.silhouette);
        return true;
      });

    if (!outfits.length) {
      return { statusCode: 502, headers, body: JSON.stringify({ error: "Empty outfits after filter" }) };
    }

    if (week) {
      // Ensure day labels even if model omitted some
      outfits.forEach((o, i) => {
        o.day = o.day || WEEK_DAYS[i];
        o.option = i + 1;
      });
      const keySet = new Set();
      const shoppingList = [];
      const fromModel = Array.isArray(parsed.shoppingList) ? parsed.shoppingList : [];
      for (const row of fromModel) {
        const key = typeof row === "string" ? row : row?.key;
        if (!key || !allowed.has(key) || keySet.has(key)) continue;
        keySet.add(key);
        shoppingList.push({
          key,
          reason: (typeof row === "object" && row?.reason) || "",
        });
      }
      // Fill any missing keys used in outfits
      for (const o of outfits) {
        for (const key of o.items) {
          if (keySet.has(key)) continue;
          keySet.add(key);
          shoppingList.push({ key, reason: "" });
        }
      }
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ outfits, shoppingList, mode: "week", source: "claude" }),
      };
    }

    return { statusCode: 200, headers, body: JSON.stringify({ outfits, source: "claude" }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: String(err.message || err) }) };
  }
};
