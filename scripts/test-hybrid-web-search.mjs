/**
 * Unit tests for hybrid Serper web search helpers (no network).
 * Usage: node scripts/test-hybrid-web-search.mjs
 */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  thinFamilies,
  countByFamily,
  buildFamilySearchQuery,
  mergeWebCardsIntoCatalog,
  THIN_THRESHOLD,
} = require("../netlify/functions/lib/hybridWebSearch.cjs");
const { normalizeShoppingHit, parsePrice } = require("../netlify/functions/lib/serperShopping.cjs");
const { monetizeProductUrl, monetizeProductCard, isAwinUrl } = require("../netlify/functions/lib/affiliateLinks.cjs");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

// --- thin detection ---
const fat = [];
for (let i = 0; i < 20; i += 1) fat.push({ key: `aw-b${i}`, family: "belt" });
for (let i = 0; i < 30; i += 1) fat.push({ key: `aw-s${i}`, family: "shoe" });
for (let i = 0; i < 15; i += 1) fat.push({ key: `aw-sg${i}`, family: "sunglasses" });
for (let i = 0; i < 15; i += 1) fat.push({ key: `aw-sc${i}`, family: "scarf" });
assert(thinFamilies(fat).length === 0, "healthy belt+shoe+accessories pool should not be thin");

const skinny = [
  ...Array.from({ length: 5 }, (_, i) => ({ key: `aw-b${i}`, family: "belt" })),
  ...Array.from({ length: 5 }, (_, i) => ({ key: `aw-s${i}`, family: "shoe" })),
  { key: "aw-shirt", family: "shirt" },
];
const thin = thinFamilies(skinny);
assert(thin.includes("belt"), "belt below threshold must be thin");
assert(thin.includes("shoe"), "shoe below threshold must be thin");
assert(!thin.includes("shirt"), "shirt is not a thin-target family");
assert(countByFamily(skinny).belt === 5, "belt count");

// --- query builder ---
const dressQ = buildFamilySearchQuery("shoe", { prompt: "black-tie wedding", profile: { palette: ["Navy"] } });
assert(/dress|oxford|derby/i.test(dressQ), `dressy shoe query expected, got ${dressQ}`);
assert(/navy/i.test(dressQ), "palette color should appear in query");
const gymQ = buildFamilySearchQuery("shoe", { prompt: "gym workout" });
assert(/sneaker|athletic/i.test(gymQ), `active shoe query expected, got ${gymQ}`);
const beltQ = buildFamilySearchQuery("belt", { prompt: "casual Friday" });
assert(/belt/i.test(beltQ) && /mens/i.test(beltQ), `belt query ok: ${beltQ}`);

// --- normalize ---
const card = normalizeShoppingHit({
  title: "Allen Edmonds Leather Belt",
  price: "$98.00",
  source: "Nordstrom",
  link: "https://www.nordstrom.com/s/belt",
  imageUrl: "https://example.com/belt.jpg",
}, "belt", 0);
assert(card && card.key.startsWith("web-"), "web key prefix");
assert(card.family === "belt", "family");
assert(card.price === 98, `price parse got ${card.price}`);
assert(card.source === "serper", "source serper");
assert(parsePrice("$1,299.50") === 1299.5, "comma price");

// --- monetize ---
assert(isAwinUrl("https://www.awin1.com/pclick.php?p=1"), "awin detect");
const awinKeep = monetizeProductUrl("https://www.awin1.com/pclick.php?p=1");
assert(awinKeep.includes("awin1.com"), "awin urls stay awin");
process.env.SKIMLINKS_SITE_ID = "12345X";
const wrapped = monetizeProductUrl("https://www.nordstrom.com/s/belt");
assert(wrapped.includes("go.skimresources.com"), "skimlinks wrap");
assert(wrapped.includes("12345X"), "site id in wrap");
const monetized = monetizeProductCard({ ...card, shopUrl: "https://www.nordstrom.com/s/belt" });
assert(monetized.affiliateNetwork === "skimlinks", "card affiliate network");
delete process.env.SKIMLINKS_SITE_ID;

// --- merge ---
const merged = mergeWebCardsIntoCatalog({
  catalogKeys: ["aw-1"],
  catalogItems: [{ key: "aw-1", name: "Shirt", family: "shirt" }],
  webCards: [card],
});
assert(merged.catalogKeys.includes(card.key), "merged keys");
assert(merged.webProducts[card.key], "webProducts map");
assert(merged.catalogItems.some((i) => i.key === card.key && i.family === "belt"), "model items include web");

assert(THIN_THRESHOLD.belt === 12, "belt threshold documented");

console.log("PASS hybrid web search helpers");
