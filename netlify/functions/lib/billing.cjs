/**
 * Vestra billing helpers (Netlify / Stripe).
 * Free: 3 live stylist requests per UTC calendar month (hard gate).
 * Pro: soft fair-use cap (100/month) — feels unlimited for real users;
 *       excess is logged and softly paused with a friendly notice (not a hard error).
 */
const FREE_STYLIST_LIMIT = 3;
/** Soft fair-use ceiling for Pro. Not shown in marketing UI as a hard "limit". */
const PRO_STYLIST_SOFT_LIMIT = 100;
const PRO_STATUSES = new Set(["active", "trialing"]);

function currentPeriodYm(d = new Date()) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function isProStatus(status) {
  return PRO_STATUSES.has(String(status || "").toLowerCase());
}

function siteUrl(event) {
  const fromEnv = String(process.env.URL || process.env.DEPLOY_PRIME_URL || "").trim().replace(/\/+$/, "");
  if (fromEnv) return fromEnv;
  const proto = event?.headers?.["x-forwarded-proto"] || "https";
  const host = event?.headers?.["x-forwarded-host"] || event?.headers?.host;
  if (host) return `${proto}://${host}`;
  return "https://wearvestra.com";
}

function allowedPriceIds() {
  return [
    String(process.env.STRIPE_PRICE_MONTHLY || "").trim(),
    String(process.env.STRIPE_PRICE_YEARLY || "").trim(),
  ].filter(Boolean);
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Content-Type": "application/json",
  };
}

function periodUsed(row, period) {
  let used = Number(row?.stylist_requests_used) || 0;
  if (row?.stylist_requests_period !== period) used = 0;
  return used;
}

function logProFairUse({ userId, used, period, phase }) {
  console.warn(
    JSON.stringify({
      event: "PRO_FAIR_USE_EXCEEDED",
      phase,
      userId,
      used,
      softLimit: PRO_STYLIST_SOFT_LIMIT,
      period,
      ts: new Date().toISOString(),
    }),
  );
}

/**
 * After a successful live stylist response, increment usage for free AND Pro.
 * Free still hard-caps at FREE_STYLIST_LIMIT via checkStylistQuota before the call.
 * Pro increments for fair-use observability; soft-cap is enforced in checkStylistQuota.
 */
async function consumeStylistRequest(admin, userId) {
  const period = currentPeriodYm();
  const { data: row, error } = await admin
    .from("profiles")
    .select("subscription_status, stylist_requests_used, stylist_requests_period")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;

  const pro = isProStatus(row?.subscription_status);
  let used = periodUsed(row, period);

  if (!pro && used >= FREE_STYLIST_LIMIT) {
    return {
      ok: false,
      pro: false,
      used,
      limit: FREE_STYLIST_LIMIT,
      remaining: 0,
      code: "quota_exceeded",
    };
  }

  const next = used + 1;
  const { error: upErr } = await admin
    .from("profiles")
    .update({
      stylist_requests_used: next,
      stylist_requests_period: period,
    })
    .eq("id", userId);
  if (upErr) throw upErr;

  if (pro && next >= PRO_STYLIST_SOFT_LIMIT) {
    logProFairUse({ userId, used: next, period, phase: "consume" });
  }

  if (pro) {
    return {
      ok: true,
      pro: true,
      used: next,
      // Keep marketing "unlimited" — soft limit is internal only
      limit: null,
      remaining: null,
    };
  }

  return {
    ok: true,
    pro: false,
    used: next,
    limit: FREE_STYLIST_LIMIT,
    remaining: Math.max(0, FREE_STYLIST_LIMIT - next),
  };
}

async function checkStylistQuota(admin, userId) {
  const period = currentPeriodYm();
  const { data: row, error } = await admin
    .from("profiles")
    .select("subscription_status, stylist_requests_used, stylist_requests_period, stripe_customer_id")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;

  const used = periodUsed(row, period);
  const stripeCustomerId = row?.stripe_customer_id || null;

  if (isProStatus(row?.subscription_status)) {
    if (used >= PRO_STYLIST_SOFT_LIMIT) {
      logProFairUse({ userId, used, period, phase: "check" });
      return {
        ok: false,
        pro: true,
        status: row.subscription_status,
        used,
        // Internal soft limit only — UI should not present this as free-tier quota
        limit: PRO_STYLIST_SOFT_LIMIT,
        remaining: 0,
        stripeCustomerId,
        code: "fair_use_soft_cap",
      };
    }
    return {
      ok: true,
      pro: true,
      status: row.subscription_status,
      used,
      limit: null,
      remaining: null,
      stripeCustomerId,
    };
  }

  const remaining = Math.max(0, FREE_STYLIST_LIMIT - used);
  return {
    ok: remaining > 0,
    pro: false,
    status: row?.subscription_status || "free",
    used,
    limit: FREE_STYLIST_LIMIT,
    remaining,
    stripeCustomerId,
    code: remaining > 0 ? null : "quota_exceeded",
  };
}

function mapStripeSubscriptionStatus(stripeStatus) {
  const s = String(stripeStatus || "").toLowerCase();
  if (PRO_STATUSES.has(s)) return s;
  if (s === "canceled" || s === "unpaid" || s === "incomplete_expired" || s === "paused") {
    return s === "canceled" ? "canceled" : s;
  }
  if (s === "past_due" || s === "incomplete") return s;
  return s || "free";
}

module.exports = {
  FREE_STYLIST_LIMIT,
  PRO_STYLIST_SOFT_LIMIT,
  PRO_STATUSES,
  currentPeriodYm,
  isProStatus,
  siteUrl,
  allowedPriceIds,
  corsHeaders,
  consumeStylistRequest,
  checkStylistQuota,
  mapStripeSubscriptionStatus,
};
