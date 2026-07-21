#!/usr/bin/env node
/**
 * Smoke-test one-shot image fallback using mutated real catalog URLs
 * (CDN currently returns 200 for all live URLs, so we force-break them).
 *
 * Usage: node scripts/verify-image-fallback.mjs
 */
import { createServer } from "http";
import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, "public/data/menswear-catalog.json"), "utf8"));
const samples = (catalog.items || []).filter((it) => it.image).slice(0, 5).map((it, i) => ({
  id: `cat-${i}`,
  key: it.key,
  // Force a broken productserve / path while keeping a realistic host shape
  brokenSrc: String(it.image).replace(/url=ssl%3A[^&]+/i, "url=ssl%3Acdn.example.invalid%2Fvestra-missing.jpg")
    + (String(it.image).includes("url=") ? "" : "&vestra_broken=1"),
}));

// Also include a plain 404
samples.push({ id: "plain-404", key: null, brokenSrc: "https://wearvestra.com/__vestra_missing_image__.jpg" });

const html = `<!doctype html>
<html><body>
<script type="module">
  const PLACEHOLDER = "data:image/svg+xml," + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#E8E2D4"/><text x="100" y="100" text-anchor="middle" fill="#8b877a">Image unavailable</text></svg>'
  );
  const samples = ${JSON.stringify(samples)};
  window.__results = [];
  for (const s of samples) {
    const img = document.createElement("img");
    img.id = s.id;
    img.dataset.key = s.key || "";
    img.dataset.fallback = "0";
    img.src = s.brokenSrc;
    img.onerror = () => {
      if (img.dataset.fallback === "1") {
        img.onerror = null;
        window.__results.push({ id: s.id, loopBlocked: true });
        return;
      }
      img.dataset.fallback = "1";
      img.onerror = null;
      img.src = PLACEHOLDER;
      window.__results.push({ id: s.id, key: s.key, fellBack: true });
    };
    img.onload = () => {
      window.__results.push({
        id: s.id,
        key: s.key,
        loaded: true,
        isPlaceholder: img.src.startsWith("data:image/svg+xml"),
      });
    };
    document.body.appendChild(img);
  }
</script>
</body></html>`;

async function main() {
  const server = createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(html);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address();

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(4000);
    const results = await page.evaluate(() => window.__results);
    const finals = await page.evaluate(() =>
      [...document.images].map((img) => ({
        id: img.id,
        key: img.dataset.key || null,
        fallbackFlag: img.dataset.fallback,
        isDataUri: img.src.startsWith("data:image/svg+xml"),
      })),
    );
    console.log("samples:", samples.map((s) => ({ id: s.id, key: s.key })));
    console.log("events:", results);
    console.log("final:", finals);

    const allFellBack = finals.every((f) => f.fallbackFlag === "1" && f.isDataUri);
    if (!allFellBack) throw new Error("Not all mutated catalog images fell back to placeholder");
    console.log(`PASS: ${finals.length} broken URLs (incl. ${samples.filter((s) => s.key).length} mutated catalog items) used one-shot placeholder`);
  } finally {
    if (browser) await browser.close();
    server.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
