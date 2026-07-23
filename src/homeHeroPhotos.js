/**
 * Home-screen Style DNA hero photos (A/B/C per archetype).
 * Source: curated Unsplash License images under /public/heroes/home/
 *
 * Selection: stable index from userId || profileName hash so the hero
 * does not flicker on reload, while still rotating across the user base.
 */

const ASSET_V = "homehero1";
const assetUrl = (path) => `${path}?v=${ASSET_V}`;

/** Canonical keys match normalizeArchetype() output (ampersands stripped). */
const HOME_HERO_BY_ARCHETYPE = {
  "Quiet Tailored": ["01-quiet-A.jpg", "01-quiet-B.jpg", "01-quiet-C.jpg"],
  "Relaxed Considered": ["02-relaxed-A.jpg", "02-relaxed-B.jpg", "02-relaxed-C.jpg"],
  "Modern Sharp": ["03-modern-A.jpg", "03-modern-B.jpg", "03-modern-C.jpg"],
  "Warm Layered": ["04-warm-A.jpg", "04-warm-B.jpg", "04-warm-C.jpg"],
  "Classic Polished": ["05-classic-A.jpg", "05-classic-B.jpg", "05-classic-C.jpg"],
  "Minimal Directional": ["06-minimal-A.jpg", "06-minimal-B.jpg", "06-minimal-C.jpg"],
  "Romantic Soft": ["07-romantic-A.jpg", "07-romantic-B.jpg", "07-romantic-C.jpg"],
  "Bold Expressive": ["08-bold-A.jpg", "08-bold-B.jpg", "08-bold-C.jpg"],
  "Streetwear Cool": ["09-street-A.jpg", "09-street-B.jpg", "09-street-C.jpg"],
  "Sexy Evening": ["10-sexy-A.jpg", "10-sexy-B.jpg", "10-sexy-C.jpg"],
  "Edgy Contemporary": ["11-edgy-A.jpg", "11-edgy-B.jpg", "11-edgy-C.jpg"],
};

const DEFAULT_HERO_FILES = ["00-default-A.jpg", "00-default-B.jpg", "00-default-C.jpg"];

function normalizeArchetypeKey(archetype) {
  return String(archetype || "")
    .replace(/\s*&\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stableIndex(seed, modulo) {
  const n = Math.max(1, Number(modulo) || 1);
  const s = String(seed || "vestra");
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % n;
}

/**
 * @param {{ archetype?: string|null, userId?: string|null, profileName?: string|null }} opts
 * @returns {{ src: string, archetypeKey: string|null, option: "A"|"B"|"C", files: string[] }}
 */
export function pickHomeHeroPhoto({ archetype, userId, profileName } = {}) {
  const key = normalizeArchetypeKey(archetype);
  const files = (key && HOME_HERO_BY_ARCHETYPE[key]) || DEFAULT_HERO_FILES;
  const seed = userId || profileName || key || "guest";
  const idx = stableIndex(`${seed}::${key || "default"}`, files.length);
  const file = files[idx];
  const option = /** @type {"A"|"B"|"C"} */ (["A", "B", "C"][idx] || "A");
  return {
    src: assetUrl(`/heroes/home/${file}`),
    archetypeKey: key || null,
    option,
    files,
  };
}

export { HOME_HERO_BY_ARCHETYPE, DEFAULT_HERO_FILES, normalizeArchetypeKey };
