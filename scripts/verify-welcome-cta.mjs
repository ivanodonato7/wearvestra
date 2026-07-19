/**
 * Fresh visitor: empty localStorage — Get Started + Skip must navigate.
 */
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import puppeteer from "puppeteer-core";

const PORT = 4177;
const BASE = `http://127.0.0.1:${PORT}`;

const preview = spawn("npx", ["vite", "preview", "--host", "127.0.0.1", "--port", String(PORT)], {
  cwd: "/workspace",
  stdio: ["ignore", "pipe", "pipe"],
});

async function waitForServer(ms = 20000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    try {
      if ((await fetch(BASE)).ok) return;
    } catch { /* retry */ }
    await sleep(200);
  }
  throw new Error("preview did not start");
}

async function freshPage(browser) {
  const page = await browser.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e)));
  await page.goto(BASE, { waitUntil: "networkidle0", timeout: 30000 });
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.reload({ waitUntil: "networkidle0", timeout: 30000 });
  await sleep(400);
  return { page, errs };
}

try {
  await waitForServer();
  await sleep(500);
  const browser = await puppeteer.launch({
    executablePath: "/usr/local/bin/google-chrome",
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });

  // --- Get Started ---
  {
    const { page, errs } = await freshPage(browser);
    const onWelcome = await page.$('[data-testid="welcome-get-started"]');
    if (!onWelcome) throw new Error("Get Started button missing on fresh load");
    await onWelcome.click();
    await sleep(400);
    const text = await page.evaluate(() => document.body.innerText);
    if (!/call you|create your account/i.test(text)) {
      throw new Error(`Get Started did not reach signup. UI: ${text.slice(0, 200)}`);
    }
    // Confirm stage persisted as signup (not wiped back to welcome)
    await sleep(350);
    const stored = await page.evaluate(() => localStorage.getItem("vestra.profile.v1"));
    const parsed = JSON.parse(stored || "{}");
    if (parsed.stage !== "signup") {
      throw new Error(`Expected stored stage signup, got ${parsed.stage}`);
    }
    console.log("PASS Get Started → signup; stored stage=", parsed.stage);
    console.log("errors:", errs);
    await page.close();
  }

  // --- Skip for testing ---
  {
    const { page, errs } = await freshPage(browser);
    await page.click('[data-testid="welcome-skip"]');
    await sleep(400);
    const text = await page.evaluate(() => document.body.innerText);
    if (!/style dna|ask your stylist/i.test(text)) {
      throw new Error(`Skip did not reach app. UI: ${text.slice(0, 200)}`);
    }
    await sleep(350);
    const stored = await page.evaluate(() => localStorage.getItem("vestra.profile.v1"));
    const parsed = JSON.parse(stored || "{}");
    if (parsed.stage !== "app" || !parsed.profile?.name) {
      throw new Error(`Skip storage bad: ${stored}`);
    }
    console.log("PASS Skip → app; profile=", parsed.profile.name);
    console.log("errors:", errs);
    await page.close();
  }

  await browser.close();
  console.log("\nALL PASS — fresh visitor can enter the app");
  process.exitCode = 0;
} catch (e) {
  console.error("\nFAIL:", e);
  process.exitCode = 1;
} finally {
  preview.kill("SIGTERM");
}
