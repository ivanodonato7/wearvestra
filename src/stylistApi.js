/**
 * Optional live stylist backend.
 * Uses /api/stylist (Netlify rewrite → stylist function) once — do NOT also hit
 * /.netlify/functions/stylist (same backend; doubles cold-start + Claude latency).
 * Falls back to null so the client composer can run.
 *
 * Modes:
 *   - "looks" (default): 3 outfit options
 *   - "week": Mon–Fri week wardrobe plan (5 looks, no repeat silhouettes, shopping list)
 *
 * When Stripe billing is on, pass accessToken so the server can enforce the free cap.
 * Quota / auth errors return { error, code, ... } instead of null (so UI can upgrade-prompt).
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

async function postStylist(endpoint, payload, signal, accessToken) {
  const headers = { "Content-Type": "application/json" };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
    signal,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 || res.status === 402) {
    return {
      error: data.error || (res.status === 401 ? "Sign in required" : "Quota exceeded"),
      code: data.code || (res.status === 401 ? "auth_required" : "quota_exceeded"),
      used: data.used,
      limit: data.limit,
      remaining: data.remaining,
    };
  }
  if (!res.ok) return null;
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
  accessToken = null,
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
    const data = await postStylist(stylistEndpoint(), payload, controller.signal, accessToken);
    if (!data) return null;
    if (data.error) return data;
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
