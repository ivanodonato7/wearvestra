/**
 * Optional live stylist backend.
 * Tries endpoints in order until one returns outfits:
 *   1. VITE_STYLIST_ENDPOINT
 *   2. /api/stylist          (Netlify redirect)
 *   3. /.netlify/functions/stylist
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

function candidateEndpoints() {
  const fromEnv =
    typeof import.meta !== "undefined" && import.meta.env?.VITE_STYLIST_ENDPOINT
      ? String(import.meta.env.VITE_STYLIST_ENDPOINT)
      : "";
  return [fromEnv, "/api/stylist", "/.netlify/functions/stylist"].filter(Boolean);
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
  mode,
  avoidRecentItems = [],
  avoidSilhouettes = [],
}) {
  const resolvedMode = mode || (isWeekPlanPrompt(prompt) ? "week" : "looks");
  const totalTimeoutMs = resolvedMode === "week" ? 22000 : 14000;
  const deadline = Date.now() + totalTimeoutMs;
  const payload = {
    prompt,
    profile,
    lang,
    catalogKeys,
    mode: resolvedMode,
    avoidRecentItems: [...new Set(avoidRecentItems || [])].slice(0, 40),
    avoidSilhouettes: [...new Set(avoidSilhouettes || [])].slice(0, 20),
  };

  for (const endpoint of candidateEndpoints()) {
    const remaining = deadline - Date.now();
    if (remaining < 400) break;
    // Fresh AbortController per endpoint so a hung first URL doesn't abort the rest
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), remaining);
    try {
      const data = await postStylist(endpoint, payload, controller.signal);
      if (data) {
        return {
          ...data,
          mode: data.mode || resolvedMode,
        };
      }
    } catch {
      // try next endpoint
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}
