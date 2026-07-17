#!/usr/bin/env node
/**
 * Scan Bing Shopping for in-stock listings matching each catalog item.
 * Writes JSON to public/stock/{key}.json (+ index.json).
 *
 * Usage: node scripts/scan-stock.js
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, "public", "stock");

const CATALOG = {
  blazer: "olive green wool tailored blazer",
  blazerAlt: "sand beige unstructured linen blazer",
  blazerNavy: "navy wool tailored blazer",
  blazerBlack: "black wool tailored blazer",
  shirt: "ivory crisp cotton dress shirt",
  shirtAlt: "charcoal fine merino turtleneck sweater",
  trouser: "olive tailored straight leg trousers",
  trouserAlt: "grey wide leg wool trousers",
  trouserNavy: "navy tailored dress trousers",
  trouserBlack: "black tailored dress trousers",
  shoe: "brown leather derby dress shoes",
  shoeAlt: "dark brown suede chelsea boots",
  shoeBlack: "black leather derby dress shoes",
  scarf: "camel tan fine wool scarf",
  scarfAlt: "gold cashmere pocket square",
  scarfBurgundy: "burgundy wool scarf",
  belt: "brown leather dress belt",
  beltAlt: "black leather dress belt",
  sunglasses: "tortoise acetate sunglasses",
  sunglassesAlt: "black acetate sunglasses",
};

const MERCHANT_MAP = {
  "asos.com": "ASOS",
  "nordstrom.com": "Nordstrom",
  "fwrd.com": "Forward",
  "realry.com": "Realry",
  "walmart.com": "Walmart",
  "poshmark.com": "Poshmark",
  "charlestyrwhitt.com": "Charles Tyrwhitt",
  "saksfifthavenue.com": "Saks",
  "farfetch.com": "Farfetch",
  "net-a-porter.com": "Net-a-Porter",
  "ssense.com": "SSENSE",
  "mrporter.com": "MR PORTER",
  "zara.com": "Zara",
  "hm.com": "H&M",
  "uniqlo.com": "Uniqlo",
  "gap.com": "Gap",
  "target.com": "Target",
  "macys.com": "Macy's",
  "bloomingdales.com": "Bloomingdale's",
  "suitsupply.com": "SuitSupply",
  "arket.com": "ARKET",
  "cos.com": "COS",
  "editorialist.com": "Editorialist",
  "therealreal.com": "The RealReal",
  "ebay.com": "eBay",
  "amazon.com": "Amazon",
  "shopbop.com": "Shopbop",
  "revolve.com": "Revolve",
  "anthropologie.com": "Anthropologie",
  "jcrew.com": "J.Crew",
  "bananarepublic.com": "Banana Republic",
  "everlane.com": "Everlane",
  "aritzia.com": "Aritzia",
  "lululemon.com": "Lululemon",
  "nike.com": "Nike",
  "adidas.com": "adidas",
};

function merchantFromUrl(u) {
  try {
    const host = new URL(u).hostname.replace(/^www\./, "");
    for (const [k, v] of Object.entries(MERCHANT_MAP)) {
      if (host === k || host.endsWith(`.${k}`)) return v;
    }
    const base = host.split(".")[0].replace(/-/g, " ");
    return base.replace(/\b\w/g, (c) => c.toUpperCase());
  } catch {
    return "Retailer";
  }
}

function decodeEscapes(s) {
  return s
    .replace(/\\u0022/g, '"')
    .replace(/\\u0026/g, "&")
    .replace(/\\u0027/g, "'")
    .replace(/\\u003d/g, "=")
    .replace(/\\u003c/g, "<")
    .replace(/\\u003e/g, ">")
    .replace(/\\\//g, "/");
}

async function fetchShoppingHtml(query) {
  const url = `https://www.bing.com/shop?q=${encodeURIComponent(query)}&FORM=SHOPTB`;
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9",
      Accept: "text/html,application/xhtml+xml",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${query}`);
  return res.text();
}

function extractProducts(html, limit = 12) {
  const re = /CustomData\":\"(\{.*?\})\"/g;
  const seen = new Set();
  const products = [];
  let m;
  while ((m = re.exec(html)) && products.length < limit) {
    try {
      const data = JSON.parse(decodeEscapes(m[1]));
      if (!data.PageUrl || !data.Price) continue;
      const key = data.GlobalOfferId || data.PageUrl;
      if (seen.has(key)) continue;
      seen.add(key);
      const title = String(data.ToolTip || data.Title || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 100);
      if (!title) continue;
      products.push({
        title,
        price: data.Price,
        merchant: merchantFromUrl(data.PageUrl),
        url: data.PageUrl,
        image: data.MediaUrl || "",
        availability: "In stock",
      });
    } catch {
      // skip malformed blob
    }
  }
  return products;
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const index = { updatedAt: new Date().toISOString(), items: {} };

  for (const [key, query] of Object.entries(CATALOG)) {
    process.stdout.write(`Scanning ${key}… `);
    try {
      const html = await fetchShoppingHtml(query);
      const products = extractProducts(html, 12);
      const payload = {
        query,
        scannedAt: new Date().toISOString(),
        source: "bing_shopping",
        products,
      };
      fs.writeFileSync(path.join(OUT_DIR, `${key}.json`), JSON.stringify(payload, null, 2));
      index.items[key] = { query, count: products.length };
      console.log(`${products.length} in-stock offers`);
    } catch (err) {
      console.log(`FAILED: ${err.message}`);
      index.items[key] = { query, count: 0, error: String(err.message) };
    }
    await sleep(900);
  }

  fs.writeFileSync(path.join(OUT_DIR, "index.json"), JSON.stringify(index, null, 2));
  console.log(`Wrote ${OUT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
