/**
 * Unit checks for outfit hero color/pattern matching.
 */
import { pickOutfitHeroPhoto, scoreOutfitHero, deriveOutfitHeroAttrs, OUTFIT_HERO_CATALOG } from "../src/outfitHeroPhotos.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const greySuit = {
  key: "suit-grey",
  family: "blazer",
  name: "Grey & Red Windowpane Plaid Men's Suit",
  paletteTags: ["Grey / Charcoal", "Bold Color"],
  color: "#4a4a48",
};
const turquoiseShirt = {
  key: "shirt-tq",
  family: "shirt",
  name: "Turquoise dress shirt",
  paletteTags: ["Bold Color"],
  color: "#2A9D8F",
};
const woolTrouser = {
  key: "trouser-wool",
  family: "trouser",
  name: "Charcoal wool trousers",
  paletteTags: ["Grey / Charcoal"],
  color: "#4a4a48",
};
const shoe = { key: "shoe-1", family: "shoe", name: "Black oxford", paletteTags: ["Black"] };
const belt = { key: "belt-1", family: "belt", name: "Black leather belt", paletteTags: ["Black"] };

const catalog = {
  [greySuit.key]: greySuit,
  [turquoiseShirt.key]: turquoiseShirt,
  [woolTrouser.key]: woolTrouser,
  [shoe.key]: shoe,
  [belt.key]: belt,
};

const greenBlazer = {
  key: "blazer-green",
  family: "blazer",
  name: "Mens Blazer - Green Velvet Fabric - Double Breasted Blazer",
  paletteTags: ["Forest Green"],
  color: "#2f3d2e",
};
const beigeTrouser = {
  key: "trouser-beige",
  family: "trouser",
  name: "Beige chino trousers",
  paletteTags: ["Sand / Beige"],
};
catalog[greenBlazer.key] = greenBlazer;
catalog[beigeTrouser.key] = beigeTrouser;

// 1) Grey windowpane → grey/neutral, NOT black evening, NOT colorful street
{
  const items = [greySuit.key, turquoiseShirt.key, woolTrouser.key, shoe.key, belt.key];
  const attrs = deriveOutfitHeroAttrs({ items, catalog, occasion: "wedding", styleFamily: "classy", prompt: "wedding" });
  assert(attrs.primaryColor === "grey", `expected grey primary, got ${attrs.primaryColor}`);
  assert(attrs.pattern === "windowpane" || attrs.pattern === "plaid", `expected windowpane/plaid, got ${attrs.pattern}`);
  const pick = pickOutfitHeroPhoto({ items, catalog, occasion: "wedding", styleFamily: "classy", prompt: "wedding", seed: "t1" });
  assert(!pick.photo.colors.includes("colorful") || pick.photo.colors[0] === "grey", `colorful photo picked: ${pick.file}`);
  assert(pick.photo.colors[0] !== "black", `black-lead photo for grey look: ${pick.file}`);
  assert(pick.photo.colors.includes("grey") || pick.photo.colors.includes("cream"), `no grey/neutral: ${pick.file}`);
  console.log("ok grey windowpane →", pick.file, pick.photo.colors, "score", pick.score.toFixed(1));
}

// 2) Navy blazer → navy
{
  const navy = {
    key: "navy-1",
    family: "blazer",
    name: "Navy wool blazer",
    paletteTags: ["Navy"],
  };
  catalog[navy.key] = navy;
  const items = [navy.key, turquoiseShirt.key.replace("tq", "white") || "shirt-tq", woolTrouser.key, shoe.key, belt.key];
  // use cream shirt
  catalog["shirt-white"] = { key: "shirt-white", family: "shirt", name: "White dress shirt", paletteTags: ["White"] };
  const items2 = [navy.key, "shirt-white", woolTrouser.key, shoe.key, belt.key];
  const pick = pickOutfitHeroPhoto({ items: items2, catalog, occasion: "work", styleFamily: "classy", prompt: "interview", seed: "t2" });
  assert(pick.photo.colors.includes("navy"), `expected navy photo, got ${pick.file} ${pick.photo.colors}`);
  console.log("ok navy blazer →", pick.file, pick.photo.colors);
}

// 3) Black evening → black
{
  const blackSuit = { key: "black-suit", family: "blazer", name: "Black tuxedo", paletteTags: ["Black"] };
  catalog[blackSuit.key] = blackSuit;
  const items = [blackSuit.key, "shirt-white", shoe.key, belt.key, woolTrouser.key];
  catalog["trouser-black"] = { key: "trouser-black", family: "trouser", name: "Black dress trousers", paletteTags: ["Black"] };
  const items3 = [blackSuit.key, "shirt-white", "trouser-black", shoe.key, belt.key];
  const pick = pickOutfitHeroPhoto({ items: items3, catalog, occasion: "date-night", styleFamily: "sexy", prompt: "evening", seed: "t3" });
  assert(pick.photo.colors.includes("black"), `expected black photo, got ${pick.file}`);
  console.log("ok black evening →", pick.file, pick.photo.formality);
}

// 4) Green velvet → olive/green, NOT colorful patterned
{
  const items = [greenBlazer.key, "shirt-white", beigeTrouser.key, shoe.key, belt.key];
  const attrs = deriveOutfitHeroAttrs({ items, catalog, occasion: "date-night", styleFamily: "modern", prompt: "first date" });
  assert(attrs.primaryColor === "green" || attrs.primaryColor === "olive", `expected green/olive primary, got ${attrs.primaryColor}`);
  const pick = pickOutfitHeroPhoto({ items, catalog, occasion: "date-night", styleFamily: "modern", prompt: "first date", seed: "t4" });
  assert(
    pick.photo.colors.includes("olive") || pick.photo.colors.includes("green"),
    `expected olive/green photo, got ${pick.file} ${pick.photo.colors}`,
  );
  assert(!pick.photo.colors.includes("colorful") || pick.score < 0, `colorful jacket for green velvet: ${pick.file}`);
  console.log("ok green velvet →", pick.file, pick.photo.colors, pick.attrs.primaryColor);
}

// 5) Clash scoring: grey look prefers grey photo over navy wedding check
{
  const attrs = deriveOutfitHeroAttrs({
    items: [greySuit.key, "shirt-white", woolTrouser.key, shoe.key, belt.key],
    catalog,
    occasion: "wedding",
    styleFamily: "classy",
  });
  const greyPhoto = OUTFIT_HERO_CATALOG.find((p) => p.file.includes("06-minimal-A"));
  const navyWedding = OUTFIT_HERO_CATALOG.find((p) => p.file.includes("him-wedding"));
  const blackEvening = OUTFIT_HERO_CATALOG.find((p) => p.file.includes("03-modern-B"));
  const colorful = OUTFIT_HERO_CATALOG.find((p) => p.file.includes("08-bold-A"));
  const g = scoreOutfitHero(greyPhoto, attrs);
  const n = scoreOutfitHero(navyWedding, attrs);
  const b = scoreOutfitHero(blackEvening, attrs);
  const c = scoreOutfitHero(colorful, attrs);
  assert(g > n, `grey ${g} should beat navy wedding ${n}`);
  assert(g > b, `grey ${g} should beat black evening ${b}`);
  assert(g > c, `grey ${g} should beat colorful ${c}`);
  console.log("ok clash scoring: grey", g, "> navy", n, "> black", b, "> colorful", c);
}

console.log("\nPASS outfit hero color/pattern matching");
