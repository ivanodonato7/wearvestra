/**
 * Optional live stylist backend.
 * Tries endpoints in order until one returns outfits:
 *   1. VITE_STYLIST_ENDPOINT
 *   2. /api/stylist          (Netlify redirect)
 *   3. /.netlify/functions/stylist
 * Falls back to null so the client composer can run.
 */
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

export async function fetchStylistLooks({ prompt, profile, lang = "en", catalogKeys = [] }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 14000);
  const payload = { prompt, profile, lang, catalogKeys };
  try {
    for (const endpoint of candidateEndpoints()) {
      try {
        const data = await postStylist(endpoint, payload, controller.signal);
        if (data) return data;
      } catch {
        // try next endpoint
      }
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}
