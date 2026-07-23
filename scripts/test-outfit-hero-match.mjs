/**
 * Outfit hero color/formality matching tests.
 * Usage: node scripts/test-outfit-hero-match.mjs
 */
import assert from "node:assert/strict";
import {
  pickOutfitHeroPhoto,
  deriveOutfitHeroAttrs,
  scoreOutfitHero,
  OUTFIT_HERO_CATALOG,
} from "../src/outfitHeroPhotos.js";

const catalog = {
  blazerGrey: {
    family: "blazer",
    name: "Grey & Red Windowpane Plaid Suit Jacket",
    color: "#6b6b63",
    paletteTags: ["Grey / Charcoal"],
  },
  shirtTeal: {
    family: "shirt",
    name: "Turquoise Dress Shirt",
    color: "#2a8f8a",
    paletteTags: ["Bold Color"],
  },
  trouserWool: {
    family: "trouser",
    name: "Wool Trousers",
    color: "#4a4a48",
    paletteTags: ["Grey / Charcoal"],
  },
  blazerNavy: {
    family: "blazer",
    name: "Navy Wool Tailored Blazer",
    color: "#1f2a44",
    paletteTags: ["Navy"],
  },
  shirtWhite: {
    family: "shirt",
    name: "White Dress Shirt",
    color: "#F5F2E9",
    paletteTags: ["Ivory / Cream", "White"],
  },
  blazerBlack: {
    family: "blazer",
    name: "Black Wool Blazer",
    color: "#161616",
    paletteTags: ["Black"],
  },
};

// Grey windowpane look must NOT get a navy-led blue suit photo
const greyPick = pickOutfitHeroPhoto({
  items: ["blazerGrey", "shirtTeal", "trouserWool"],
  catalog,
  occasion: "wedding",
  styleFamily: "classy",
  prompt: "wedding guest",
});
assert.equal(greyPick.attrs.primaryColor, "grey", `expected grey primary, got ${greyPick.attrs.primaryColor}`);
assert.ok(
  !greyPick.photo.colors.includes("navy") || greyPick.photo.colors.includes("grey"),
  `grey outfit got navy-clash hero: ${greyPick.file} colors=${greyPick.photo.colors}`,
);
assert.ok(
  greyPick.photo.colors.includes("grey") || greyPick.photo.colors.every((c) => ["black", "grey", "cream", "beige"].includes(c)),
  `grey outfit should prefer grey/neutral hero, got ${greyPick.file}`,
);
console.log("ok grey windowpane →", greyPick.file, greyPick.photo.colors, "score", greyPick.score.toFixed(1));

// Navy look should prefer navy photos
const navyPick = pickOutfitHeroPhoto({
  items: ["blazerNavy", "shirtWhite"],
  catalog,
  occasion: "work",
  styleFamily: "classy",
});
assert.equal(navyPick.attrs.primaryColor, "navy");
assert.ok(navyPick.photo.colors.includes("navy"), `navy outfit should get navy hero, got ${navyPick.file}`);
console.log("ok navy blazer →", navyPick.file, navyPick.photo.colors);

// Black evening → black evening/smart
const blackPick = pickOutfitHeroPhoto({
  items: ["blazerBlack"],
  catalog,
  occasion: "date-night",
  styleFamily: "sexy",
});
assert.ok(blackPick.photo.colors.includes("black"));
assert.ok(["evening", "smart"].includes(blackPick.photo.formality));
console.log("ok black evening →", blackPick.file, blackPick.photo.formality);

// Explicit clash: navy photo scores worse than grey photo for grey outfit
const attrs = deriveOutfitHeroAttrs({
  items: ["blazerGrey", "trouserWool"],
  catalog,
  occasion: "wedding",
});
const navyPhoto = OUTFIT_HERO_CATALOG.find((p) => p.file.includes("him-wedding"));
const greyPhoto = OUTFIT_HERO_CATALOG.find((p) => p.file.includes("02-relaxed-A"));
assert.ok(navyPhoto && greyPhoto);
const navyScore = scoreOutfitHero(navyPhoto, attrs);
const greyScore = scoreOutfitHero(greyPhoto, attrs);
assert.ok(greyScore > navyScore, `grey photo (${greyScore}) should beat navy wedding (${navyScore}) for grey outfit`);
console.log("ok clash scoring: grey", greyScore, "> navy wedding", navyScore);

console.log("\nPASS outfit hero color/formality matching");
