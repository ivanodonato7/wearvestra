/**
 * Client for /api/product-search (Awin product feed proxy).
 * Session-caches the mens catalog so we don't hammer the API every stylist turn.
 */
import { applyLiveProducts, resetCatalog } from "./catalogStore.js";

const CACHE_KEY = "vestra_product_catalog_awin_v1";
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes per session/tab

function endpoint() {
  const fromEnv =
    typeof import.meta !== "undefined" && import.meta.env?.VITE_PRODUCT_SEARCH_ENDPOINT
      ? String(import.meta.env.VITE_PRODUCT_SEARCH_ENDPOINT).trim()
      : "";
  return fromEnv || "/api/product-search";
}

function readCache() {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.fetchedAt || !Array.isArray(parsed.items)) return null;
    if (Date.now() - parsed.fetchedAt > CACHE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(payload) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    /* quota */
  }
}

let inflight = null;

/**
 * Ensure CATALOG is populated from the live feed (or backup).
 * Safe to call many times — uses session cache + single-flight.
 */
export async function ensureProductCatalog({ force = false } = {}) {
  if (!force) {
    const cached = readCache();
    if (cached?.items?.length) {
      const applied = applyLiveProducts(cached.items);
      return { ...applied, cached: true, reason: cached.reason || null };
    }
  }

  if (inflight) return inflight;

  inflight = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const res = await fetch(endpoint(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audience: "men", limitPerCategory: 40 }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`product-search ${res.status}`);
      const data = await res.json();
      const items = Array.isArray(data.items) ? data.items : [];
      if (!items.length || data.source === "backup") {
        const applied = resetCatalog();
        writeCache({ fetchedAt: Date.now(), items: [], source: "backup", reason: data.reason || "empty" });
        return { ...applied, cached: false, reason: data.reason || "empty" };
      }
      const applied = applyLiveProducts(items);
      writeCache({
        fetchedAt: Date.now(),
        items,
        source: data.source || "awin",
        reason: null,
      });
      return { ...applied, cached: false, reason: null };
    } catch (err) {
      const applied = resetCatalog();
      return {
        ...applied,
        cached: false,
        reason: err?.name === "AbortError" ? "timeout" : "network",
      };
    } finally {
      clearTimeout(timer);
      inflight = null;
    }
  })();

  return inflight;
}
