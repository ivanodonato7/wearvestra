/**
 * Vestra billing helpers (Netlify / Stripe).
 * Free: 3 live stylist requests per UTC calendar month.
 * Pro: subscription_status active|trialing → unlimited.
 */
const FREE_STYLIST_LIMIT = 3;
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

/**
 * After a successful live stylist response, increment free-tier usage.
 * Pro users are not incremented.
 */
async function consumeStylistRequest(admin, userId) {
  const period = currentPeriodYm();
  const { data: row, error } = await admin
    .from("profiles")
    .select("subscription_status, stylist_requests_used, stylist_requests_period")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;

  if (isProStatus(row?.subscription_status)) {
    return { ok: true, pro: true, used: 0, limit: null, remaining: null };
  }

  let used = Number(row?.stylist_requests_used) || 0;
  if (row?.stylist_requests_period !== period) used = 0;

  if (used >= FREE_STYLIST_LIMIT) {
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

  if (isProStatus(row?.subscription_status)) {
    return {
      ok: true,
      pro: true,
      status: row.subscription_status,
      used: 0,
      limit: null,
      remaining: null,
      stripeCustomerId: row.stripe_customer_id || null,
    };
  }

  let used = Number(row?.stylist_requests_used) || 0;
  if (row?.stylist_requests_period !== period) used = 0;
  const remaining = Math.max(0, FREE_STYLIST_LIMIT - used);
  return {
    ok: remaining > 0,
    pro: false,
    status: row?.subscription_status || "free",
    used,
    limit: FREE_STYLIST_LIMIT,
    remaining,
    stripeCustomerId: row?.stripe_customer_id || null,
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
