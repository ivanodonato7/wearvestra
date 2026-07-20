/**
 * AI outfit hero via Netlify → FASHN Virtual Try-On.
 * Chains one garment per function call (Netlify timeout-safe), keeps API key server-side.
 * Falls back to null so the UI can keep the collage / item list.
 */

const HERO_CACHE_KEY = "vestra.heroCache.v1";
const HERO_CACHE_MAX = 16;
const STEP_TIMEOUT_MS = 55000;

function heroEndpoint() {
  const fromEnv =
    typeof import.meta !== "undefined" && import.meta.env?.VITE_HERO_ENDPOINT
      ? String(import.meta.env.VITE_HERO_ENDPOINT).trim()
      : "";
  // Single path — /api/generate-hero already rewrites to the Netlify function
  return fromEnv || "/api/generate-hero";
}

/** Wear order for try-on layering: top → outer → bottom → shoes → accessories. */
export function wearOrderKeys(itemKeys = []) {
  const keys = (itemKeys || []).filter(Boolean);
  const pick = (pred) => keys.find(pred);
  const ordered = [
    pick((k) => /^shirt/i.test(k)),
    pick((k) => /^blazer/i.test(k)),
    pick((k) => /^trouser/i.test(k)),
    pick((k) => /^shoe/i.test(k)),
    pick((k) => /^(belt|scarf|sunglasses)/i.test(k)),
  ].filter(Boolean);
  for (const k of keys) {
    if (!ordered.includes(k)) ordered.push(k);
  }
  return ordered;
}

export function heroCacheKey(itemKeys, gender = "man") {
  return `man:${wearOrderKeys(itemKeys).join("|")}`;
}

function loadHeroCache() {
  try {
    const raw = localStorage.getItem(HERO_CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveHeroCache(cache) {
  try {
    const entries = Object.entries(cache || {});
    entries.sort((a, b) => (b[1]?.ts || 0) - (a[1]?.ts || 0));
    localStorage.setItem(HERO_CACHE_KEY, JSON.stringify(Object.fromEntries(entries.slice(0, HERO_CACHE_MAX))));
  } catch {
    try {
      const entries = Object.entries(cache || {});
      entries.sort((a, b) => (b[1]?.ts || 0) - (a[1]?.ts || 0));
      localStorage.setItem(
        HERO_CACHE_KEY,
        JSON.stringify(Object.fromEntries(entries.slice(0, Math.floor(HERO_CACHE_MAX / 2)))),
      );
    } catch {
      /* ignore */
    }
  }
}

export function getCachedHero(itemKeys, gender) {
  const key = heroCacheKey(itemKeys, gender);
  const entry = loadHeroCache()[key];
  return entry?.image || null;
}

export function setCachedHero(itemKeys, gender, image) {
  if (!image) return;
  const key = heroCacheKey(itemKeys, gender);
  const cache = loadHeroCache();
  cache[key] = { image, ts: Date.now() };
  saveHeroCache(cache);
}

export function clearHeroCache() {
  try {
    localStorage.removeItem(HERO_CACHE_KEY);
  } catch {
    /* ignore */
  }
}

function categoryForKey(key) {
  if (/^trouser/i.test(key)) return "bottoms";
  if (/^(shirt|blazer)/i.test(key)) return "tops";
  return "auto";
}

function absoluteAssetUrl(path, origin) {
  if (!path) return "";
  if (/^https?:\/\//i.test(path) || path.startsWith("data:")) return path;
  const base = (origin || (typeof window !== "undefined" ? window.location.origin : "")).replace(/\/$/, "");
  const clean = String(path).split("?")[0];
  return `${base}${clean.startsWith("/") ? "" : "/"}${clean}`;
}

async function postHeroStep(payload, signal) {
  try {
    const res = await fetch(heroEndpoint(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal,
    });
    if (res.status === 503) return { unavailable: true };
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.image) return { image: String(data.image) };
  } catch {
    /* network / abort */
  }
  return null;
}

/**
 * Chain FASHN try-on steps: each garment layers onto the previous model image.
 * @returns {Promise<string|null>} final image URL or data URL
 */
export async function fetchHeroTryOn({ itemKeys, catalog, signal }) {
  const ordered = wearOrderKeys(itemKeys);
  if (!ordered.length) return null;

  const origin = typeof window !== "undefined" ? window.location.origin : "https://wearvestra.com";
  let modelImage = absoluteAssetUrl("/models/model-man-everyday.jpg", origin);

  let stepsOk = 0;

  for (const key of ordered) {
    if (signal?.aborted) return null;
    const garmentImage = absoluteAssetUrl(catalog?.[key]?.image, origin);
    if (!garmentImage) continue;

    const controller = new AbortController();
    const onAbort = () => controller.abort();
    signal?.addEventListener("abort", onAbort);
    const timer = setTimeout(() => controller.abort(), STEP_TIMEOUT_MS);

    try {
      const next = await postHeroStep(
        {
          modelImage,
          garmentImage,
          category: categoryForKey(key),
          gender: "man",
          baseUrl: origin,
        },
        controller.signal,
      );
      if (next?.unavailable) return null; // no FASHN key / service down — skip remaining layers
      if (next?.image) {
        modelImage = next.image;
        stepsOk += 1;
      }
      // if a layer fails (e.g. sunglasses), keep prior modelImage and continue
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    }
  }

  return stepsOk > 0 ? modelImage : null;
}
