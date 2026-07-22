/**
 * TEMPORARY diagnostic — remove after portal failure is diagnosed.
 * GET /api/stripe-portal-diag?k=<one-shot-key>
 *
 * Uses live STRIPE_SECRET_KEY + service role to:
 *  - report key mode (live/test)
 *  - list Customer Portal configurations
 *  - for each profile with stripe_customer_id, try customers.retrieve + portal session create
 * Returns Stripe's real error messages (no secrets).
 */
const Stripe = require("stripe");
const { getServiceClient } = require("./lib/supabaseAdmin.cjs");
const { corsHeaders, siteUrl } = require("./lib/billing.cjs");

const DIAG_KEY = "vestra-portal-diag-2026-07-22-k9f3m2";

exports.handler = async (event) => {
  const headers = corsHeaders();
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers, body: "" };
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "GET only" }) };
  }

  const k = String((event.queryStringParameters || {}).k || "").trim();
  if (k !== DIAG_KEY) {
    return { statusCode: 404, headers, body: JSON.stringify({ error: "Not found" }) };
  }

  const secret = String(process.env.STRIPE_SECRET_KEY || "").trim();
  if (!secret) {
    return { statusCode: 503, headers, body: JSON.stringify({ error: "Stripe not configured" }) };
  }

  const admin = getServiceClient();
  if (!admin) {
    return {
      statusCode: 503,
      headers,
      body: JSON.stringify({ error: "Supabase service role not configured" }),
    };
  }

  const keyMode = secret.startsWith("sk_live_")
    ? "live"
    : secret.startsWith("sk_test_")
      ? "test"
      : "unknown";

  const stripe = new Stripe(secret);
  const report = {
    keyMode,
    keyPrefix: secret.slice(0, 8),
    returnUrl: `${siteUrl(event)}/`,
    portalConfigurations: null,
    portalConfigError: null,
    profilesChecked: 0,
    results: [],
  };

  try {
    const configs = await stripe.billingPortal.configurations.list({ limit: 5 });
    report.portalConfigurations = (configs.data || []).map((c) => ({
      id: c.id,
      active: c.active,
      isDefault: c.is_default,
    }));
  } catch (err) {
    report.portalConfigError = {
      type: err.type || null,
      code: err.code || null,
      message: String(err.message || err).slice(0, 400),
    };
  }

  const { data: profiles, error: pErr } = await admin
    .from("profiles")
    .select("id, subscription_status, stripe_customer_id, stripe_subscription_id")
    .not("stripe_customer_id", "is", null)
    .limit(25);

  if (pErr) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ ...report, profileQueryError: pErr.message }),
    };
  }

  report.profilesChecked = (profiles || []).length;

  for (const row of profiles || []) {
    const customerId = row.stripe_customer_id;
    const entry = {
      profileIdPrefix: String(row.id || "").slice(0, 8),
      subscriptionStatus: row.subscription_status,
      customerIdPrefix: String(customerId || "").slice(0, 12),
      customerIdLength: String(customerId || "").length,
      customerLooksLikeTest: /test/i.test(String(customerId || "")),
      retrieve: null,
      portal: null,
    };

    try {
      const cust = await stripe.customers.retrieve(customerId);
      entry.retrieve = {
        ok: true,
        livemode: cust.livemode,
        deleted: Boolean(cust.deleted),
        idPrefix: String(cust.id || "").slice(0, 12),
      };
    } catch (err) {
      entry.retrieve = {
        ok: false,
        type: err.type || null,
        code: err.code || null,
        message: String(err.message || err).slice(0, 400),
      };
    }

    try {
      const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: `${siteUrl(event)}/`,
      });
      entry.portal = {
        ok: true,
        livemode: session.livemode,
        urlHost: session.url ? new URL(session.url).host : null,
      };
    } catch (err) {
      entry.portal = {
        ok: false,
        type: err.type || null,
        code: err.code || null,
        message: String(err.message || err).slice(0, 400),
      };
    }

    report.results.push(entry);
  }

  console.log("stripe-portal-diag", JSON.stringify(report));
  return { statusCode: 200, headers, body: JSON.stringify(report, null, 2) };
};
