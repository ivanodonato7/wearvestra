/**
 * Optional live stylist backend.
 * Uses /api/stylist (Netlify rewrite → stylist function) once — do NOT also hit
 * /.netlify/functions/stylist (same backend; doubles cold-start + Claude latency).
 * Falls back to null so the client composer can run.
 *
 * Modes:
 *   - "looks" (default): 3 outfit options
 *   - "week": Mon–Fri week wardrobe plan (5 looks, no repeat silhouettes, shopping list)
 */

export function isWeekPlanPrompt(prompt) {
  const lower = String(prompt || "").toLowerCase();
  if (!lower.trim()) return false;
  return (
    /\bweek\s*wardrobe\b/.test(lower)
    || /\bplan\s+my\s+week\b/.test(lower)
    || /\b5\s+looks\b/.test(lower)
    || /\bmon(?:day)?\s*[-–—]\s*fri(?:day)?\b/.test(lower)
    || /\bplanifica\s+mi\s+semana\b/.test(lower)
    || /\bplanifier\s+ma\s+semaine\b/.test(lower)
    || /\bsemana\b/.test(lower) && /\b5\b/.test(lower)
    || /\bsemaine\b/.test(lower) && /\b5\b/.test(lower)
  );
}

function stylistEndpoint() {
  const fromEnv =
    typeof import.meta !== "undefined" && import.meta.env?.VITE_STYLIST_ENDPOINT
      ? String(import.meta.env.VITE_STYLIST_ENDPOINT).trim()
      : "";
  return fromEnv || "/api/stylist";
}

async function postStylist(endpoint, payload, signal) {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (!data?.outfits?.length) return null;
  return data;
}

export async function fetchStylistLooks({
  prompt,
  profile,
  lang = "en",
  catalogKeys = [],
  catalogItems = [],
  formalityTarget = null,
  mode,
  avoidRecentItems = [],
  avoidSilhouettes = [],
}) {
  const resolvedMode = mode || (isWeekPlanPrompt(prompt) ? "week" : "looks");
  const timeoutMs = resolvedMode === "week" ? 22000 : 14000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const keys = catalogKeys.length
    ? catalogKeys
    : (catalogItems || []).map((i) => i.key).filter(Boolean);
  const payload = {
    prompt,
    profile,
    lang,
    catalogKeys: keys,
    catalogItems: Array.isArray(catalogItems) ? catalogItems.slice(0, 200) : [],
    formalityTarget,
    mode: resolvedMode,
    avoidRecentItems: [...new Set(avoidRecentItems || [])].slice(0, 40),
    avoidSilhouettes: [...new Set(avoidSilhouettes || [])].slice(0, 20),
  };
  try {
    const data = await postStylist(stylistEndpoint(), payload, controller.signal);
    if (!data) return null;
    return {
      ...data,
      mode: data.mode || resolvedMode,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
