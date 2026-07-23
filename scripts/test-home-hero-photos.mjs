/**
 * Smoke test for home hero A/B/C mapping.
 * Usage: node scripts/test-home-hero-photos.mjs
 */
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  pickHomeHeroPhoto,
  HOME_HERO_BY_ARCHETYPE,
  DEFAULT_HERO_FILES,
} from "../src/homeHeroPhotos.js";

const root = join(process.cwd(), "public/heroes/home");

for (const [arch, files] of Object.entries(HOME_HERO_BY_ARCHETYPE)) {
  assert.equal(files.length, 3, `${arch} must have A/B/C`);
  for (const f of files) {
    assert.ok(existsSync(join(root, f)), `missing ${f} for ${arch}`);
  }
}
for (const f of DEFAULT_HERO_FILES) {
  assert.ok(existsSync(join(root, f)), `missing default ${f}`);
}

const a = pickHomeHeroPhoto({ archetype: "Classic & Polished", userId: "user-1" });
const b = pickHomeHeroPhoto({ archetype: "Classic Polished", userId: "user-1" });
assert.equal(a.src, b.src, "ampersand vs spaced archetype must match");
assert.match(a.option, /^[ABC]$/);

const c = pickHomeHeroPhoto({ archetype: "Classic & Polished", userId: "user-2" });
// Different users may share an option; only assert stability for same seed
const again = pickHomeHeroPhoto({ archetype: "Classic & Polished", userId: "user-1" });
assert.equal(again.src, a.src, "same user must get stable hero");

const def = pickHomeHeroPhoto({ archetype: null, profileName: "Alex" });
assert.ok(def.src.includes("/heroes/home/00-default-"));

console.log("PASS home hero A/B/C mapping (", Object.keys(HOME_HERO_BY_ARCHETYPE).length, "archetypes + default)");
console.log("sample Classic user-1 →", a.option, a.src);
console.log("sample Classic user-2 →", c.option, c.src);
console.log("sample default →", def.option, def.src);
