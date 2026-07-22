/**
 * TEMPORARY forensics — remove after investigation.
 * GET /api/stripe-webhook-forensics?k=<key>
 *
 * Returns:
 *  - runtime key mode
 *  - live Stripe webhook endpoints (from this key's account)
 *  - profile row for ivanodonato7@gmail.com
 *  - recent stripe_webhook_events rows (idempotency table)
 *  - whether livemode guard code path would ignore a test event
 */
const Stripe = require("stripe");
const { getServiceClient } = require("./lib/supabaseAdmin.cjs");
const { corsHeaders } = require("./lib/billing.cjs");

const DIAG_KEY = "vestra-wh-forensics-2026-07-22-z4";
const TARGET_EMAIL = "ivanodonato7@gmail.com";

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
  const whSecret = String(process.env.STRIPE_WEBHOOK_SECRET || "").trim();
  const admin = getServiceClient();
  if (!secret || !admin) {
    return { statusCode: 503, headers, body: JSON.stringify({ error: "not configured" }) };
  }

  const report = {
    now: new Date().toISOString(),
    keyMode: secret.startsWith("sk_live_") ? "live" : secret.startsWith("sk_test_") ? "test" : "unknown",
    keyPrefix: secret.slice(0, 8),
    webhookSecretConfigured: Boolean(whSecret),
    webhookSecretPrefix: whSecret ? whSecret.slice(0, 6) : null, // whsec_ vs empty — not full secret
    webhookSecretLooksLike: whSecret.startsWith("whsec_") ? "whsec" : whSecret ? "other" : "missing",
    guardWouldIgnoreTestEvent: secret.startsWith("sk_live_"),
    stripeAccount: null,
    liveWebhookEndpoints: null,
    profile: null,
    recentWebhookEvents: null,
    webhookEventsAroundRewrite: null,
    activeProfiles: null,
  };

  const stripe = new Stripe(secret);

  try {
    const acct = await stripe.accounts.retrieve();
    report.stripeAccount = {
      id: acct.id,
      type: acct.type || null,
      email: acct.email || null,
      country: acct.country || null,
      livemodeDefault: null,
    };
  } catch (err) {
    // Restricted keys sometimes can't retrieve account; try balance as livemode signal
    try {
      const bal = await stripe.balance.retrieve();
      report.stripeAccount = {
        retrieveError: String(err.message || err).slice(0, 200),
        balanceLivemode: bal.livemode,
      };
    } catch (err2) {
      report.stripeAccount = {
        error: String(err.message || err).slice(0, 200),
        balanceError: String(err2.message || err2).slice(0, 200),
      };
    }
  }

  try {
    const eps = await stripe.webhookEndpoints.list({ limit: 100 });
    report.liveWebhookEndpoints = (eps.data || []).map((e) => ({
      id: e.id,
      url: e.url,
      status: e.status,
      livemode: e.livemode,
      apiVersion: e.api_version || null,
      enabledEvents: e.enabled_events,
      created: e.created,
      description: e.description || null,
    }));
    report.liveWebhookEndpointCount = (eps.data || []).length;
    report.note =
      "webhookEndpoints.list with sk_live_ returns LIVE-mode endpoints only for this Stripe account. Test-mode endpoints require sk_test_ and are not visible here.";
  } catch (err) {
    report.liveWebhookEndpoints = {
      error: String(err.message || err).slice(0, 300),
      code: err.code || null,
    };
  }

  // Resolve user + profile
  let userId = null;
  try {
    const { data: listed } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const match = (listed?.users || []).find(
      (u) => String(u.email || "").toLowerCase() === TARGET_EMAIL
    );
    if (match) userId = match.id;
    report.authUser = match
      ? { id: match.id, email: match.email }
      : { found: false };
  } catch (err) {
    report.authUser = { error: String(err.message || err).slice(0, 200) };
  }

  if (userId) {
    const { data: profile, error } = await admin
      .from("profiles")
      .select(
        "id, subscription_status, stripe_customer_id, stripe_subscription_id, updated_at"
      )
      .eq("id", userId)
      .maybeSingle();
    report.profile = error ? { error: error.message } : profile;
  }

  // Idempotency table — proof of what the webhook handler actually claimed
  try {
    const { data: rows, error } = await admin
      .from("stripe_webhook_events")
      .select("event_id, event_type, livemode, created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) {
      report.recentWebhookEvents = { error: error.message, code: error.code };
    } else {
      report.recentWebhookEvents = rows || [];
      report.recentWebhookEventCount = (rows || []).length;
      // Window around reported rewrite 2026-07-22 15:27:05 UTC
      const start = Date.parse("2026-07-22T15:20:00.000Z");
      const end = Date.parse("2026-07-22T15:35:00.000Z");
      report.webhookEventsAroundRewrite = (rows || []).filter((r) => {
        const t = Date.parse(r.created_at);
        return t >= start && t <= end;
      });
    }
  } catch (err) {
    report.recentWebhookEvents = { error: String(err.message || err).slice(0, 200) };
  }

  try {
    const { data: pros } = await admin
      .from("profiles")
      .select("id, subscription_status, stripe_customer_id, stripe_subscription_id, updated_at")
      .eq("stripe_customer_id", "cus_UvXhFZwpMqMnYd");
    report.profilesWithStaleCustomer = pros || [];
  } catch (err) {
    report.profilesWithStaleCustomer = { error: String(err.message || err).slice(0, 200) };
  }

  // Verify customer still missing in THIS account
  try {
    await stripe.customers.retrieve("cus_UvXhFZwpMqMnYd");
    report.staleCustomerInThisAccount = { exists: true };
  } catch (err) {
    report.staleCustomerInThisAccount = {
      exists: false,
      code: err.code || null,
      message: String(err.message || err).slice(0, 200),
    };
  }

  console.log("stripe-webhook-forensics", JSON.stringify(report));
  return { statusCode: 200, headers, body: JSON.stringify(report, null, 2) };
};
