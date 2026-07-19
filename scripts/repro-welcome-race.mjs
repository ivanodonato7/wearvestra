/**
 * Reproduces the first-visit "dead CTA" race:
 * click → React updates → reload before debounced localStorage write.
 * After the fix, sync persistBootstrap + hash must survive the reload.
 */
import puppeteer from 'puppeteer-core';
import { setTimeout as sleep } from 'node:timers/promises';
import fs from 'node:fs';

const BASE = process.env.VESTRA_URL || 'http://127.0.0.1:4173/';

async function withFreshBrowser(label, fn) {
  const profile = `/tmp/vestra-race-${label}-${Date.now()}`;
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

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function openEmpty(browser) {
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.goto(BASE, { waitUntil: 'networkidle0', timeout: 60000 });
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.goto(BASE, { waitUntil: 'networkidle0', timeout: 60000 });
  await sleep(800);
  return { page, errs };
}

await withFreshBrowser('start-race', async (browser) => {
  console.log('\n======== GET STARTED + IMMEDIATE RELOAD ========');
  const { page, errs } = await openEmpty(browser);
  assert(/get started/i.test(await page.evaluate(() => document.body.innerText)), 'not on welcome');
  await page.click('[data-testid="welcome-get-started"]');
  const mid = await page.evaluate(() => ({
    ls: localStorage.getItem('vestra.profile.v1'),
    hash: location.hash,
  }));
  console.log('immediately after click', { stage: JSON.parse(mid.ls || '{}').stage, hash: mid.hash });
  assert(JSON.parse(mid.ls || '{}').stage === 'signup', 'stage not synced to localStorage before reload window');
  assert(mid.hash === '#signup', 'hash not set to #signup');
  await page.reload({ waitUntil: 'networkidle0' });
  await sleep(800);
  const after = await page.evaluate(() => document.body.innerText);
  assert(/call you|create your account/i.test(after), 'reload lost signup: ' + after.slice(0, 160));
  console.log('GET STARTED RACE PASS', { errs });
});

await withFreshBrowser('skip-race', async (browser) => {
  console.log('\n======== SKIP + IMMEDIATE RELOAD ========');
  const { page, errs } = await openEmpty(browser);
  await page.click('[data-testid="welcome-skip"]');
  const mid = await page.evaluate(() => ({
    ls: localStorage.getItem('vestra.profile.v1'),
    hash: location.hash,
  }));
  const stored = JSON.parse(mid.ls || '{}');
  console.log('immediately after click', { stage: stored.stage, name: stored.profile?.name, hash: mid.hash });
  assert(stored.stage === 'app', 'stage not synced to app');
  assert(!!stored.profile?.name, 'profile name missing');
  assert(mid.hash === '#app', 'hash not set to #app');
  await page.reload({ waitUntil: 'networkidle0' });
  await sleep(800);
  const after = await page.evaluate(() => document.body.innerText);
  assert(/style dna|ask your stylist/i.test(after), 'reload lost app: ' + after.slice(0, 160));
  console.log('SKIP RACE PASS', { errs });
});

console.log('\nBOTH RACE TESTS PASS against', BASE);
