/**
 * Optional live stylist backend.
 * Tries (in order):
 *   1. VITE_STYLIST_ENDPOINT (e.g. Netlify function)
 *   2. /.netlify/functions/stylist
 * Falls back to null so the client composer can run.
 */
const ENDPOINT =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_STYLIST_ENDPOINT) ||
  "/.netlify/functions/stylist";

export async function fetchStylistLooks({ prompt, profile, lang = "en", catalogKeys = [] }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, profile, lang, catalogKeys }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.outfits?.length) return null;
    return data;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
