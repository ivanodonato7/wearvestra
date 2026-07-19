import { setTimeout as sleep } from "node:timers/promises";
import puppeteer from "puppeteer-core";

const BASE = process.env.BASE || "https://wearvestra.com/";

async function run(label, clickFn, expectFn) {
  const browser = await puppeteer.launch({
    executablePath: "/usr/local/bin/google-chrome",
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });

  await page.goto(BASE, { waitUntil: "networkidle0", timeout: 60000 });
  await page.evaluate(async () => {
    localStorage.clear();
    sessionStorage.clear();
    const regs = await navigator.serviceWorker?.getRegistrations?.() || [];
    await Promise.all(regs.map((r) => r.unregister()));
    const keys = await caches?.keys?.() || [];
    await Promise.all(keys.map((k) => caches.delete(k)));
  });
  await page.reload({ waitUntil: "networkidle0", timeout: 60000 });
  await sleep(800);

  const before = await page.evaluate(() => document.body.innerText);
  console.log(`\n=== ${label} @ ${BASE} ===`);
  console.log("has Get Started:", /get started/i.test(before));
  console.log("build meta:", await page.$eval('meta[name="vestra-build"]', (el) => el.content).catch(() => "n/a"));

  await clickFn(page);
  await sleep(800);

  const after = await page.evaluate(() => document.body.innerText);
  console.log("AFTER:", after.replace(/\s+/g, " ").slice(0, 280));
  console.log("errors:", errs);
  const ok = expectFn(after);
  await browser.close();
  if (!ok) throw new Error(`${label} failed`);
  console.log(`${label} PASS`);
}

try {
  await run(
    "Get Started",
    async (page) => {
      const buttons = await page.$$("button");
      for (const b of buttons) {
        const t = await page.evaluate((el) => el.textContent, b);
        if (/get started/i.test(t || "")) {
          await b.click();
          return;
        }
      }
      throw new Error("Get Started button missing");
    },
    (text) => /call you|create your account|continue|email/i.test(text) && !/get started/i.test(text.split("\n").slice(0, 8).join(" ")),
  );

  await run(
    "Skip for testing",
    async (page) => {
      const buttons = await page.$$("button");
      for (const b of buttons) {
        const t = await page.evaluate((el) => el.textContent, b);
        if (/skip for testing/i.test(t || "")) {
          await b.click();
          return;
        }
      }
      throw new Error("Skip button missing");
    },
    (text) => /style dna|ask your stylist|good evening|alex/i.test(text),
  );
  console.log("\nLIVE ALL PASS");
} catch (e) {
  console.error("LIVE FAIL:", e);
  process.exitCode = 1;
}
