/**
 * Visual QA screenshots for the full UI polish pass.
 * Usage: node scripts/screenshot-ui-polish.mjs
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, readdirSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { chromium } from "playwright";

const PORT = 4191;
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = "/opt/cursor/artifacts/screenshots";

mkdirSync(OUT, { recursive: true });

const cssFile = readdirSync("/workspace/dist/assets").find((f) => f.endsWith(".css"));
const demoHtml = `<!doctype html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;1,400&display=swap"/>
<link rel="stylesheet" href="https://api.fontshare.com/v2/css?f[]=satoshi@300,400,500,600,700&display=swap"/>
<link rel="stylesheet" href="/assets/${cssFile}"/>
<style>
  body{margin:0;background:#e9e4d6;font-family:var(--vestra-font-body)}
  .shell{max-width:420px;margin:0 auto;min-height:100vh;background:var(--vestra-wash);padding:0 0 40px;box-sizing:border-box}
  .pad{padding:16px 16px 0}
</style>
</head><body><div class="shell">
  <div class="chat-wrap stylist-screen" style="height:auto;min-height:0">
    <div class="chat-header"><span style="color:#C6A567">✦</span><span> Your Stylist</span></div>
    <div class="chat-body" style="overflow:visible">
      <div class="stylist-picks-intro">Three looks for a smart-casual Friday dinner.</div>
      <div class="card outfit-card">
        <div class="eyebrow gold">Look 1 · Classic</div>
        <div class="outfit-visual">
          <div class="model-wrap outfit-hero-wrap outfit-hero-stock">
            <img class="model-photo" src="/heroes/home/00-default-A.jpg" alt=""/>
            <div class="hero-inspiration-caption">Style inspiration</div>
          </div>
          <div class="item-list">
            <div class="item-row"><button type="button" class="item-row-shop">
              <img class="item-row-image" src="/icons/favicon-32x32.png" alt=""/>
              <div class="item-row-info"><div class="item-row-brand">Emensuits</div><div class="item-row-name">Navy Merino Knit</div><div class="item-row-meta">$128 · In stock</div></div>
            </button><button type="button" class="swap-btn-sm">↻</button></div>
            <div class="item-row"><button type="button" class="item-row-shop">
              <img class="item-row-image" src="data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><rect width="200" height="200" fill="#faf6ec"/><rect x="24" y="24" width="152" height="152" rx="10" fill="#F6F1E7" stroke="rgba(198,165,103,0.55)" stroke-width="1.5"/><text x="100" y="154" text-anchor="middle" font-family="Georgia, serif" font-size="11" fill="#8b877a">No image available</text></svg>`)}" alt=""/>
              <div class="item-row-info"><div class="item-row-brand">Viaduct</div><div class="item-row-name">Charcoal Trouser</div><div class="item-row-meta">$98 · In stock</div></div>
            </button><button type="button" class="swap-btn-sm">↻</button></div>
          </div>
        </div>
        <p class="rationale">Clean silhouette with cream/gold accents — polished without trying too hard.</p>
        <button class="save-btn" type="button">Save outfit</button>
      </div>
      <div class="refine-block">
        <div class="refine-label">Refine these looks</div>
        <div class="chip-row">
          <button class="chip" type="button">More street</button>
          <button class="chip" type="button">Make it sexier</button>
          <button class="chip" type="button">More classy</button>
          <button class="chip" type="button">Under $200</button>
        </div>
      </div>
    </div>
  </div>
  <div class="pad wardrobe-screen" style="padding-top:28px">
    <h2 class="screen-title">Wardrobe</h2>
    <p class="empty-note">Outfits you save from your stylist will live here.</p>
  </div>
  <div class="pad bag-screen" style="padding-top:28px">
    <h2 class="screen-title">Bag</h2>
    <div class="retailer-group">
      <div class="section-label">Emensuits</div>
      <button class="bag-row" type="button">
        <img class="bag-image" src="/heroes/home/06-minimal-A.jpg" alt=""/>
        <div class="bag-info"><div class="bag-brand">Emensuits</div><div class="bag-name">Navy Merino Knit</div><div class="bag-price">$128 · In stock</div></div>
      </button>
    </div>
  </div>
  <div class="onb-screen onb-center onb-pro-screen" style="min-height:auto;padding:32px 20px;margin-top:12px">
    <div class="onb-eyebrow">Vestra Pro</div>
    <h2 class="onb-title onb-pro-title">Dress with intention.</h2>
    <p class="onb-hero-sub onb-pro-body">Unlimited stylist looks, week plans, and sharper edits.</p>
    <ul class="onb-pro-list"><li>Unlimited AI stylist requests</li><li>Week wardrobe plans</li><li>Priority outfit refinements</li></ul>
    <button class="onb-primary-btn" type="button">Continue</button>
    <p class="onb-pro-note">You can upgrade anytime from Profile.</p>
  </div>
</div></body></html>`;
writeFileSync("/workspace/dist/ui-polish-demo.html", demoHtml);

const preview = spawn("npx", ["vite", "preview", "--host", "127.0.0.1", "--port", String(PORT)], {
  cwd: "/workspace",
  stdio: ["ignore", "pipe", "pipe"],
});

async function waitForServer(ms = 25000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    try {
      if ((await fetch(BASE)).ok) return;
    } catch { /* retry */ }
    await sleep(200);
  }
  throw new Error("preview did not start");
}

try {
  await waitForServer();
  const browser = await chromium.launch({
    executablePath: "/usr/local/bin/google-chrome",
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  });

  await page.goto(BASE, { waitUntil: "networkidle", timeout: 30000 });
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.reload({ waitUntil: "networkidle" });
  await sleep(400);
  await page.screenshot({ path: `${OUT}/ui-polish-welcome.png`, fullPage: true });
  console.log("wrote welcome");

  await page.goto(`${BASE}/ui-polish-demo.html`, { waitUntil: "networkidle", timeout: 30000 });
  await sleep(500);
  await page.screenshot({ path: `${OUT}/ui-polish-stylist-results.png`, fullPage: false });
  await page.screenshot({ path: `${OUT}/ui-polish-full-stack.png`, fullPage: true });
  console.log("wrote stylist/wardrobe/bag/pro demo");

  // Live Pro screen via hash if supported
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.goto(`${BASE}/#pro`, { waitUntil: "networkidle" });
  await sleep(600);
  const pro = await page.$('[data-testid="onboarding-pro-screen"]');
  if (pro) {
    await page.screenshot({ path: `${OUT}/ui-polish-pro-onboarding.png`, fullPage: true });
    console.log("wrote live pro onboarding");
  } else {
    console.log("live #pro screen not available; demo covers Pro styling");
  }

  // Home after skip
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.reload({ waitUntil: "networkidle" });
  await sleep(300);
  const skip = await page.$('[data-testid="welcome-skip"]');
  if (skip) {
    await skip.click();
    await sleep(700);
    await page.screenshot({ path: `${OUT}/ui-polish-home.png`, fullPage: true });
    console.log("wrote home");
  }

  await browser.close();
} finally {
  preview.kill("SIGTERM");
}
