/**
 * Screenshots for Pro 100 looks/month copy.
 * Usage: node scripts/screenshot-pro-100-copy.mjs
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, readdirSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { chromium } from "playwright";

const PORT = 4193;
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = "/opt/cursor/artifacts/screenshots";
mkdirSync(OUT, { recursive: true });

const cssFile = readdirSync("/workspace/dist/assets").find((f) => f.endsWith(".css"));
const demo = `<!doctype html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;1,400&display=swap"/>
<link rel="stylesheet" href="https://api.fontshare.com/v2/css?f[]=satoshi@300,400,500,600,700&display=swap"/>
<link rel="stylesheet" href="/assets/${cssFile}"/>
<style>body{margin:0;background:#e9e4d6}.shell{max-width:390px;margin:0 auto;min-height:100vh;background:var(--vestra-wash,#F6F1E7)}</style>
</head><body>
<section class="shell" id="pro-onboarding">
  <div class="onb-screen onb-center onb-pro-screen" data-testid="onboarding-pro-screen" style="min-height:100vh">
    <div class="onb-eyebrow">Vestra Pro</div>
    <h2 class="onb-title onb-pro-title">3 free looks a month — or 100 with Pro.</h2>
    <p class="onb-hero-sub onb-pro-body">Free gets you started. Pro keeps every look going: 100 stylist looks a month, saved outfits across devices, and AI hero images as they roll out.</p>
    <ul class="onb-pro-list"><li>100 stylist looks per month</li><li>Saved outfits, synced</li><li>AI hero images (coming soon)</li></ul>
    <button class="onb-primary-btn" type="button">Continue with free</button>
    <p class="onb-pro-note">You can upgrade anytime from Home or Profile.</p>
  </div>
</section>
<section class="shell" id="home-free" style="margin-top:24px;padding:24px 20px">
  <div class="eyebrow muted">Good evening</div>
  <h1 class="home-name">Alex</h1>
  <div class="section-label">Ask your stylist</div>
  <div class="home-pro-prompt" data-testid="home-pro-prompt">
    <p class="home-pro-prompt-text">Get 3 free looks a month · Upgrade to Pro for 100 looks/month</p>
    <button type="button" class="home-pro-prompt-cta">Upgrade to Pro</button>
  </div>
</section>
<section class="shell" id="home-pro" style="margin-top:24px;padding:24px 20px">
  <div class="eyebrow muted">Good evening</div>
  <h1 class="home-name">Alex</h1>
  <div class="section-label">Ask your stylist</div>
  <div class="home-pro-prompt" data-testid="home-pro-prompt">
    <p class="home-pro-prompt-text" data-testid="home-pro-usage">100 of 100 looks left this month</p>
  </div>
  <p class="billing-blurb" data-testid="billing-plan-blurb" style="margin-top:18px">100 stylist looks per month and saved outfits. 100 of 100 looks left this month</p>
</section>
</body></html>`;
writeFileSync("/workspace/dist/pro-100-copy-demo.html", demo);

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
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });

  // Live app Pro onboarding via hash
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.goto(`${BASE}/#pro`, { waitUntil: "networkidle" });
  await sleep(600);
  await page.waitForSelector('[data-testid="onboarding-pro-screen"]', { timeout: 8000 });
  await page.waitForFunction(() => /100 stylist looks per month/i.test(document.body.innerText), { timeout: 8000 });
  await page.screenshot({ path: `${OUT}/pro-100-onboarding-live.png`, fullPage: true });
  console.log("wrote live onboarding");

  // Live home free teaser
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload({ waitUntil: "networkidle" });
  await sleep(300);
  await page.click('[data-testid="welcome-skip"]');
  await sleep(700);
  await page.waitForSelector('[data-testid="home-pro-prompt"]', { timeout: 8000 });
  await page.waitForFunction(() => /100 looks\/month/i.test(document.body.innerText), { timeout: 8000 });
  await page.screenshot({ path: `${OUT}/pro-100-home-free-teaser.png`, fullPage: true });
  console.log("wrote home free teaser");

  // Demo Pro usage + billing blurb
  await page.goto(`${BASE}/pro-100-copy-demo.html`, { waitUntil: "networkidle" });
  await page.locator("#pro-onboarding").screenshot({ path: `${OUT}/pro-100-onboarding-demo.png` });
  await page.locator("#home-pro").screenshot({ path: `${OUT}/pro-100-home-pro-usage.png` });
  console.log("wrote demo shots");

  await browser.close();
} finally {
  preview.kill("SIGTERM");
}
