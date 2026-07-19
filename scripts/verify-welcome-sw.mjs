/**
 * Match user repro: clear localStorage only (keep Service Worker), then click CTAs.
 */
import { setTimeout as sleep } from "node:timers/promises";
import puppeteer from "puppeteer-core";

const BASE = "https://wearvestra.com/";

async function once(label, which) {
  const browser = await puppeteer.launch({
    executablePath: "/usr/local/bin/google-chrome",
    headless: "new",
    userDataDir: `/tmp/vestra-sw-profile-${which}`,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e.message || e)));
  page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  page.on("requestfailed", (req) => {
    errs.push(`requestfailed ${req.url()} ${req.failure()?.errorText || ""}`);
  });

  // First visit — allow SW to install
  await page.goto(BASE, { waitUntil: "networkidle0", timeout: 60000 });
  await sleep(1500);
  const sw1 = await page.evaluate(async () => {
    const regs = await navigator.serviceWorker.getRegistrations();
    return regs.map((r) => r.active?.scriptURL || r.installing?.scriptURL || "pending");
  });
  console.log("SW after first visit:", sw1);

  // User repro: clear localStorage only
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle0", timeout: 60000 });
  await sleep(1000);

  const controlled = await page.evaluate(() => !!navigator.serviceWorker.controller);
  console.log("controlled by SW:", controlled);

  // Click
  const clicked = await page.evaluate((whichBtn) => {
    const buttons = [...document.querySelectorAll("button")];
    const re = whichBtn === "start" ? /get started/i : /skip for testing/i;
    const btn = buttons.find((b) => re.test(b.textContent || ""));
    if (!btn) return { ok: false, reason: "missing" };
    btn.click();
    return { ok: true, text: btn.textContent };
  }, which);
  console.log("click:", clicked);
  await sleep(1000);

  const after = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").slice(0, 300));
  const stageHint = await page.evaluate(() => {
    // Infer stage from UI
    const t = document.body.innerText;
    if (/get started/i.test(t) && /skip for testing/i.test(t)) return "welcome";
    if (/call you|create your account/i.test(t)) return "signup";
    if (/style dna|ask your stylist/i.test(t)) return "app";
    return "unknown";
  });
  console.log(`\n=== ${label} ===`);
  console.log("stageHint:", stageHint);
  console.log("AFTER:", after);
  console.log("errors:", errs.slice(0, 20));

  await browser.close();
  return { stageHint, errs, after };
}

const a = await once("Get Started (LS only)", "start");
const b = await once("Skip (LS only)", "skip");

const startOk = a.stageHint === "signup";
const skipOk = b.stageHint === "app";
console.log("\nRESULT startOk=", startOk, "skipOk=", skipOk);
if (!startOk || !skipOk) process.exitCode = 1;
