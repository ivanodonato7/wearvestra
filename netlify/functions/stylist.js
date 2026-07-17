/**
 * Netlify Function — Vestra stylist
 * Set ANTHROPIC_API_KEY in Netlify env to enable live Claude looks.
 * Returns JSON: { outfits: [{ id, option, items, rationale }], source: "claude" }
 */
const SYSTEM = `You are Vestra, a precise fashion stylist.
You ONLY dress people using the provided catalog keys.
Return STRICT JSON with this shape:
{"outfits":[{"option":1,"items":["blazerNavy","shirt","trouserNavy","shoeBlack","beltAlt"],"rationale":"..."},{"option":2,"items":[...],"rationale":"..."},{"option":3,"items":[...],"rationale":"..."}]}
Rules:
- Exactly 3 outfits.
- Each items array uses ONLY keys from the catalog list.
- Include at most one key per garment family (blazer*, shirt*, trouser*, shoe*, and one accessory family).
- Honor the user's palette colors — never choose olive/green pieces unless Olive or Forest Green is in their palette.
- Honor archetype, fit, lifestyle, budget, and occasions.
- Rationale: 1–2 sentences, mention their style profile and colors.
- No markdown, no prose outside JSON.`;

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

  const userMsg = `Language: ${lang}
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
        model: "claude-sonnet-4-20250514",
        max_tokens: 1200,
        system: SYSTEM,
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
    const outfits = (parsed.outfits || [])
      .slice(0, 3)
      .map((o, i) => ({
        id: `claude-${Date.now()}-${i}`,
        option: o.option || i + 1,
        items: (o.items || []).filter((k) => allowed.has(k)),
        rationale: o.rationale || "",
      }))
      .filter((o) => o.items.length >= 3);

    if (!outfits.length) {
      return { statusCode: 502, headers, body: JSON.stringify({ error: "Empty outfits after filter" }) };
    }
    return { statusCode: 200, headers, body: JSON.stringify({ outfits, source: "claude" }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: String(err.message || err) }) };
  }
};
