/**
 * Headless check: Her/Him toggle must change item list labels.
 * Boots vite preview, seeds a Gentlemen profile + a classy look, toggles Her, asserts names flip.
 */
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import puppeteer from "puppeteer-core";

const PORT = 4173;
const BASE = `http://127.0.0.1:${PORT}`;

function startPreview() {
  const child = spawn("npx", ["vite", "preview", "--host", "127.0.0.1", "--port", String(PORT)], {
    cwd: "/workspace",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return child;
}

async function waitForServer(ms = 15000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    try {
      const res = await fetch(BASE);
      if (res.ok) return;
    } catch {
      /* retry */
    }
    await sleep(200);
  }
  throw new Error("preview server did not start");
}

const preview = startPreview();
try {
  await waitForServer();
  const browser = await puppeteer.launch({
    executablePath: "/usr/local/bin/google-chrome",
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage();
  await page.goto(BASE, { waitUntil: "networkidle0", timeout: 30000 });

  // Seed app state: skip onboarding, land on chat with a look already composed
  await page.evaluate(() => {
    const profile = {
      name: "Test",
      audience: "Gentlemen",
      archetype: "Classic Polished",
      fit: "Tailored / fitted",
      lifestyle: "Office / client-facing",
      palette: ["Navy", "Ivory / Cream", "Black"],
      avoid: [],
      budget: "balanced",
      occasions: [],
      modelGender: "man",
      favoriteStores: [],
    };
    const outfit = {
      id: "verify-look",
      option: 1,
      styleFamily: "classy",
      occasion: "wedding",
      items: ["blazerNavy", "shirt", "trouserNavy", "shoeBlack", "beltAlt"],
      rationale: "Classy polish for verification.",
    };
    localStorage.setItem(
      "vestra.profile.v1",
      JSON.stringify({
        lang: "en",
        stage: "app",
        tab: "chat",
        profile,
        savedOutfits: [],
        messages: [
          { role: "user", text: "Dress me for a wedding" },
          { role: "assistant", text: "Styled.", outfits: [outfit], styleMood: "classy" },
        ],
      }),
    );
  });
  await page.reload({ waitUntil: "networkidle0", timeout: 30000 });

  await page.waitForSelector('[data-testid="item-list"]', { timeout: 10000 });
  const beforeGender = await page.$eval('[data-testid="item-list"]', (el) => el.getAttribute("data-gender"));
  const beforeNames = await page.$$eval("[data-item-name]", (els) => els.map((e) => e.getAttribute("data-item-name")));
  console.log("BEFORE gender=", beforeGender, "names=", beforeNames);

  // Click Her
  await page.click('[data-testid="gender-her"]');
  await sleep(300);

  const afterGender = await page.$eval('[data-testid="item-list"]', (el) => el.getAttribute("data-gender"));
  const afterNames = await page.$$eval("[data-item-name]", (els) => els.map((e) => e.getAttribute("data-item-name")));
  const herActive = await page.$eval('[data-testid="gender-her"]', (el) => el.classList.contains("active"));
  console.log("AFTER gender=", afterGender, "herActive=", herActive, "names=", afterNames);

  const changed = beforeNames.join("|") !== afterNames.join("|");
  const expectedFlip =
    afterNames.some((n) => /blouse|heel|pump|camisole|flat/i.test(n || ""))
    || beforeNames.some((n) => /derby|dress shirt|oxford/i.test(n || ""));

  if (!herActive) throw new Error("Her button did not get active class");
  if (afterGender !== "woman") throw new Error(`data-gender stayed ${afterGender}`);
  if (!changed) throw new Error(`Item names did not change.\n before: ${beforeNames}\n after: ${afterNames}`);
  if (!expectedFlip) {
    console.warn("Names changed but no clear gendered keywords — still OK if lists differ");
  }

  // Toggle back to Him and confirm reverse
  await page.click('[data-testid="gender-him"]');
  await sleep(300);
  const backNames = await page.$$eval("[data-item-name]", (els) => els.map((e) => e.getAttribute("data-item-name")));
  const backGender = await page.$eval('[data-testid="item-list"]', (el) => el.getAttribute("data-gender"));
  console.log("BACK gender=", backGender, "names=", backNames);
  if (backGender !== "man") throw new Error("Him toggle failed");
  if (backNames.join("|") === afterNames.join("|")) throw new Error("Names did not revert on Him");

  console.log("PASS: Her/Him toggle changes item list labels");
  await browser.close();
  process.exitCode = 0;
} catch (err) {
  console.error("FAIL:", err);
  process.exitCode = 1;
} finally {
  preview.kill("SIGTERM");
}
