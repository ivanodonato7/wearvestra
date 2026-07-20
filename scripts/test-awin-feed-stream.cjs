/**
 * Local fixture test for streaming menswear filter + product-search cache path.
 * Does not hit Awin — synthesizes a small CSV.gz and verifies filters.
 */
const zlib = require("zlib");
const http = require("http");
const { streamMenswearFromFeedUrl, writeMenswearCache, readMenswearCache, parsePrice, normalizeRow } = require("../netlify/functions/lib/awinMenswearFeed.cjs");
const productSearch = require("../netlify/functions/product-search.cjs");

const HEADER = [
  "aw_deep_link",
  "product_name",
  "aw_product_id",
  "merchant_name",
  "category_name",
  "aw_image_url",
  "search_price",
  "colour",
  "gender",
  "in_stock",
].join(",");

const ROWS = [
  // keep — men's blazer
  ["https://www.awin1.com/pclick.php?p=1&a=1&m=1", "Navy Wool Blazer Men", "101", "ASOS", "Mens Jackets", "https://img.example/b.jpg", "129.00", "Navy", "Men", "1"],
  // drop — baby
  ["https://www.awin1.com/pclick.php?p=2", "Baby Soft Onesie", "102", "Mothercare", "Baby Clothing", "https://img.example/baby.jpg", "19.00", "White", "Unisex", "1"],
  // keep — shirt with placeholder price (null price, still kept)
  ["https://www.awin1.com/pclick.php?p=3", "Men Oxford Shirt", "103", "Next", "Mens Shirts", "https://img.example/s.jpg", "$$PLACEHOLDER_1$$", "White", "Men", "1"],
  // drop — women
  ["https://www.awin1.com/pclick.php?p=4", "Ladies Wrap Dress", "104", "ASOS", "Womens Dresses", "https://img.example/d.jpg", "45.00", "Black", "Women", "1"],
  // keep — shoes
  ["https://www.awin1.com/pclick.php?p=5", "Men Leather Derby Shoes", "105", "Office", "Mens Shoes", "https://img.example/sh.jpg", "89.99", "Brown", "Men", "1"],
  // drop — missing deep link
  ["", "Men Trousers", "106", "ASOS", "Mens Trousers", "https://img.example/t.jpg", "40.00", "Grey", "Men", "1"],
];

function csvEscape(v) {
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

async function main() {
  // Unit: placeholder price
  if (parsePrice("$$PLACEHOLDER_1$$") !== null) throw new Error("placeholder price should be null");
  if (parsePrice("129.00") !== 129) throw new Error("numeric price parse failed");

  const csv = [HEADER, ...ROWS.map((r) => r.map(csvEscape).join(","))].join("\n");
  const gz = zlib.gzipSync(Buffer.from(csv, "utf8"));

  const server = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "application/gzip", "Content-Encoding": "gzip" });
    res.end(gz);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address();
  const feedUrl = `http://127.0.0.1:${port}/datafeed/download/apikey/test/compression/gzip/format/csv`;

  // streamMenswearFromFeedUrl requires productdata.awin.com in sync — test stream directly
  const { items, meta } = await streamMenswearFromFeedUrl(feedUrl, { maxTotal: 100 });
  server.close();

  console.log("meta", meta);
  console.log("items", items.map((i) => ({ id: i.id, name: i.name, price: i.price, shopUrl: i.shopUrl, family: i.family })));

  if (items.length !== 3) throw new Error(`expected 3 menswear items, got ${items.length}`);
  if (!items.every((i) => /awin1\.com/.test(i.shopUrl))) throw new Error("missing aw_deep_link");
  if (items.some((i) => /baby|ladies|dress/i.test(i.name))) throw new Error("excluded categories leaked");
  const shirt = items.find((i) => i.id === "103");
  if (!shirt || shirt.price !== 0 || !shirt.priceMissing) throw new Error("placeholder price not nulled");

  await writeMenswearCache({ items, meta });
  const cache = await readMenswearCache();
  if (!cache?.items?.length) throw new Error("cache write/read failed");

  const res = await productSearch.handler({
    httpMethod: "POST",
    body: JSON.stringify({ limit: 50 }),
  });
  const body = JSON.parse(res.body);
  console.log("product-search", { status: res.statusCode, source: body.source, count: body.count, sample: body.items?.[0]?.shopUrl });
  if (body.source !== "awin" || !body.items?.length) throw new Error("product-search did not serve cache");
  if (!body.items.every((i) => i.shopUrl)) throw new Error("product-search items missing shopUrl");

  // empty-key path still ok when cache cleared? — leave cache for now
  console.log("OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
