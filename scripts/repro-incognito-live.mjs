/**
 * True first-visit: separate browser profiles per test (no shared LS/SW).
 * Live site + real mouse + touch taps.
 */
import puppeteer from 'puppeteer-core';
import { setTimeout as sleep } from 'node:timers/promises';
import fs from 'node:fs';

const BASE = 'https://wearvestra.com/';

async function withFreshBrowser(label, fn) {
  const profile = `/tmp/vestra-${label}-${Date.now()}`;
  fs.mkdirSync(profile, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: '/usr/local/bin/google-chrome',
    headless: 'new',
    userDataDir: profile,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    return await fn(browser);
  } finally {
    await browser.close();
  }
}

async function openLanding(browser) {
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.goto(BASE, { waitUntil: 'networkidle0', timeout: 60000 });
  // Allow SW install / possible reload
  await sleep(3000);
  // Ensure we're on a settled document
  if (page.url() !== BASE && !page.url().startsWith(BASE)) {
    await page.goto(BASE, { waitUntil: 'networkidle0' });
  }
  // Force empty storage THEN reload — matches user clearing storage
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.reload({ waitUntil: 'networkidle0', timeout: 60000 });
  await sleep(1500);
  return { page, errs };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

// GET STARTED
await withFreshBrowser('start', async (browser) => {
  console.log('\n======== GET STARTED ========');
  const { page, errs } = await openLanding(browser);
  const before = await page.evaluate(() => document.body.innerText);
  assert(/get started/i.test(before) && /skip for testing/i.test(before), 'not on welcome: ' + before.slice(0, 120));
  const btn = await page.waitForSelector('[data-testid="welcome-get-started"]', { timeout: 5000 });
  const box = await btn.boundingBox();
  // touch tap
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await sleep(800);
  let after = await page.evaluate(() => document.body.innerText);
  let ok = /call you|create your account/i.test(after);
  if (!ok) {
    // retry with mouse
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await sleep(800);
    after = await page.evaluate(() => document.body.innerText);
    ok = /call you|create your account/i.test(after);
  }
  const stage = await page.evaluate(() => JSON.parse(localStorage.getItem('vestra.profile.v1') || '{}').stage);
  console.log({ ok, stage, errs, ui: after.replace(/\s+/g, ' ').slice(0, 200) });
  await page.screenshot({ path: '/tmp/verify-start.png', fullPage: true });
  assert(ok, 'Get Started failed');
  console.log('GET STARTED PASS');
});

// SKIP
await withFreshBrowser('skip', async (browser) => {
  console.log('\n======== SKIP ========');
  const { page, errs } = await openLanding(browser);
  const before = await page.evaluate(() => document.body.innerText);
  assert(/get started/i.test(before) && /skip for testing/i.test(before), 'not on welcome');
  const btn = await page.waitForSelector('[data-testid="welcome-skip"]', { timeout: 5000 });
  const box = await btn.boundingBox();
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await sleep(800);
  let after = await page.evaluate(() => document.body.innerText);
  let ok = /style dna|ask your stylist/i.test(after);
  if (!ok) {
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await sleep(800);
    after = await page.evaluate(() => document.body.innerText);
    ok = /style dna|ask your stylist/i.test(after);
  }
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('vestra.profile.v1') || '{}'));
  console.log({ ok, stage: stored.stage, name: stored.profile?.name, errs, ui: after.replace(/\s+/g, ' ').slice(0, 200) });
  await page.screenshot({ path: '/tmp/verify-skip.png', fullPage: true });
  assert(ok, 'Skip failed — still: ' + after.slice(0, 150));
  console.log('SKIP PASS');
});

console.log('\nBOTH PASS on live with empty storage');
