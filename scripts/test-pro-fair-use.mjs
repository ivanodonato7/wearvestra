/**
 * Assert Pro soft fair-use cap (100) without changing free-tier-3.
 * Usage: node scripts/test-pro-fair-use.mjs
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import {
  FREE_STYLIST_LIMIT as clientFree,
  PRO_STYLIST_SOFT_LIMIT as clientSoft,
} from "../src/billingApi.js";

const require = createRequire(import.meta.url);
const {
  FREE_STYLIST_LIMIT: serverFree,
  PRO_STYLIST_SOFT_LIMIT: serverSoft,
  currentPeriodYm,
} = require("../netlify/functions/lib/billing.cjs");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(clientFree === 3 && serverFree === 3, "free tier must stay at 3");
assert(clientSoft === 100 && serverSoft === 100, "Pro soft cap must be 100");

const billingSrc = readFileSync(new URL("../netlify/functions/lib/billing.cjs", import.meta.url), "utf8");
const stylistSrc = readFileSync(new URL("../netlify/functions/stylist.cjs", import.meta.url), "utf8");
const ui = readFileSync(new URL("../src/VestraPrototype.jsx", import.meta.url), "utf8");
const api = readFileSync(new URL("../src/stylistApi.js", import.meta.url), "utf8");

assert(/fair_use_soft_cap/.test(billingSrc), "billing.cjs must emit fair_use_soft_cap");
assert(/PRO_FAIR_USE_EXCEEDED/.test(billingSrc), "billing.cjs must log PRO_FAIR_USE_EXCEEDED");
assert(/fair_use_soft_cap/.test(stylistSrc), "stylist.cjs must handle fair_use_soft_cap");
assert(/statusCode: 429/.test(stylistSrc), "fair-use pause should use 429 (not free-tier 402)");
assert(/Free stylist limit reached \(3\/month\)/.test(stylistSrc), "free hard gate copy preserved");
assert(/fair_use_soft_cap/.test(api), "client stylistApi must pass through 429 fair_use_soft_cap");
assert(/billingFairUseTitle/.test(ui), "friendly fair-use copy present");
assert(/fairUseNotice/.test(ui), "UI must handle fairUseNotice without upgrade gate");

/** Mirror Pro soft-cap branch (no DB). */
function checkPro(used, period, nowPeriod = currentPeriodYm()) {
  let u = Number(used) || 0;
  if (period !== nowPeriod) u = 0;
  if (u >= serverSoft) {
    return {
      ok: false,
      pro: true,
      used: u,
      limit: serverSoft,
      remaining: 0,
      code: "fair_use_soft_cap",
    };
  }
  return { ok: true, pro: true, used: u, limit: serverSoft, remaining: Math.max(0, serverSoft - u), code: null };
}

/** Mirror free branch — must stay independent. */
function checkFree(used, period, nowPeriod = currentPeriodYm()) {
  let u = Number(used) || 0;
  if (period !== nowPeriod) u = 0;
  const remaining = Math.max(0, serverFree - u);
  return {
    ok: remaining > 0,
    pro: false,
    used: u,
    limit: serverFree,
    remaining,
    code: remaining > 0 ? null : "quota_exceeded",
  };
}

const period = currentPeriodYm();
assert(checkPro(0, period).ok, "Pro used=0 allowed");
assert(checkPro(0, period).limit === 100, "Pro ok path limit must be 100");
assert(checkPro(0, period).remaining === 100, "Pro unused remaining must be 100");
assert(checkPro(99, period).ok, "Pro used=99 still allowed (soft)");
const softBlocked = checkPro(100, period);
assert(!softBlocked.ok && softBlocked.code === "fair_use_soft_cap", "Pro used=100 soft-paused");
assert(softBlocked.limit === 100, "soft limit is 100");

assert(checkFree(2, period).ok && checkFree(2, period).code === null, "free used=2 still allowed");
const freeBlocked = checkFree(3, period);
assert(!freeBlocked.ok && freeBlocked.code === "quota_exceeded", "free used=3 still hard quota_exceeded");
assert(freeBlocked.limit === 3, "free limit remains 3 — unaffected by Pro soft cap");

const reset = checkPro(150, "2020-01", period);
assert(reset.ok && reset.used === 0, "new month resets Pro soft-cap counter");

console.log("PASS Pro soft fair-use=100; free-tier-3 unchanged");
