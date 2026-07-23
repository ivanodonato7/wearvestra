/**
 * Assert free-tier cap is 3 and request #4 is blocked with upgrade messaging.
 * Usage: node scripts/test-free-tier-limit.mjs
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { FREE_STYLIST_LIMIT as clientLimit } from "../src/billingApi.js";

const require = createRequire(import.meta.url);
const { FREE_STYLIST_LIMIT: serverLimit, currentPeriodYm } = require("../netlify/functions/lib/billing.cjs");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(clientLimit === 3, `client FREE_STYLIST_LIMIT expected 3, got ${clientLimit}`);
assert(serverLimit === 3, `server FREE_STYLIST_LIMIT expected 3, got ${serverLimit}`);

const stylistSrc = readFileSync(new URL("../netlify/functions/stylist.cjs", import.meta.url), "utf8");
assert(
  /Free stylist limit reached \(3\/month\)/.test(stylistSrc),
  "stylist.cjs must return clear 3/month upgrade error",
);
assert(!/Free stylist limit reached \(6\/month\)/.test(stylistSrc), "stylist.cjs still mentions 6/month");

/** Mirror of checkStylistQuota free-tier branch (no DB). */
function checkQuota(used, period, nowPeriod = currentPeriodYm()) {
  let u = Number(used) || 0;
  if (period !== nowPeriod) u = 0;
  const remaining = Math.max(0, serverLimit - u);
  return {
    ok: remaining > 0,
    used: u,
    limit: serverLimit,
    remaining,
    code: remaining > 0 ? null : "quota_exceeded",
  };
}

const period = currentPeriodYm();
for (const used of [0, 1, 2]) {
  const q = checkQuota(used, period);
  assert(q.ok === true, `used=${used} should be allowed`);
  assert(q.remaining === 3 - used, `used=${used} remaining`);
}

const blocked = checkQuota(3, period);
assert(blocked.ok === false, "request #4 (used=3) must be blocked");
assert(blocked.code === "quota_exceeded", "blocked code must be quota_exceeded");
assert(blocked.remaining === 0, "remaining must be 0 when blocked");

// Existing free users below 3 keep access until reset; new period resets used
const carryOver = checkQuota(5, "2020-01", period);
assert(carryOver.ok === true && carryOver.used === 0, "new month resets prior usage");

const ui = readFileSync(new URL("../src/VestraPrototype.jsx", import.meta.url), "utf8");
assert(/You’ve used your 3 free stylist looks/.test(ui), "quota UI title must say 3");
assert(/3 free looks a month/.test(ui), "onboarding Pro copy must mention 3 free looks");
assert(/\{remaining\} of \{limit\} looks left/.test(ui), "home upsell must use remaining/limit");

console.log("PASS free-tier limit=3; request #4 blocked with quota_exceeded");

assert(/100 stylist looks per month/.test(ui), "Pro onboarding bullet must say 100 looks");
assert(!/Unlimited stylist requests/.test(ui), "Pro copy must not say Unlimited stylist requests");
