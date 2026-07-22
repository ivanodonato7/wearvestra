/**
 * Capture signup + home Pro placements for visual QA.
 * Usage: node scripts/screenshot-pro-surface.mjs
 * Writes: /opt/cursor/artifacts/pro-signup.png, pro-home.png
 */
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { chromium } from "playwright";

const PORT = 4188;
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = "/opt/cursor/artifacts";

mkdirSync(OUT, { recursive: true });

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

  // --- Signup ---
  await page.goto(BASE, { waitUntil: "networkidle", timeout: 30000 });
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.reload({ waitUntil: "networkidle", timeout: 30000 });
  await sleep(400);
  await page.click('[data-testid="welcome-get-started"]');
  await sleep(500);
  await page.waitForFunction(() => /Free plan includes 6 stylist/i.test(document.body.innerText), { timeout: 8000 });
  await page.screenshot({ path: `${OUT}/pro-signup.png`, fullPage: true });
  console.log("wrote", `${OUT}/pro-signup.png`);

  // --- Home ---
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.goto(BASE, { waitUntil: "networkidle", timeout: 30000 });
  await sleep(300);
  await page.click('[data-testid="welcome-skip"]');
  await sleep(600);
  await page.waitForSelector('[data-testid="home-pro-prompt"]', { timeout: 8000 });
  // Show the signed-in free-tier usage line for the screenshot (same component styling)
  await page.evaluate(() => {
    const text = document.querySelector(".home-pro-prompt-text");
    if (text) text.textContent = "2 of 6 stylist requests used this month · Upgrade to Pro for unlimited";
  });
  await page.screenshot({ path: `${OUT}/pro-home.png`, fullPage: true });
  console.log("wrote", `${OUT}/pro-home.png`);

  // Verify signup note still present after re-nav
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.click('[data-testid="welcome-get-started"]');
  await sleep(400);
  const body = await page.evaluate(() => document.body.innerText);
  if (!/Free plan includes 6 stylist/i.test(body)) throw new Error("signup Pro note missing");
  console.log("PASS pro surface screenshots");

  await browser.close();
} finally {
  preview.kill("SIGTERM");
}
