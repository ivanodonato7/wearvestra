/**
 * TEMPORARY read-only diagnostic — remove after portal failure is diagnosed.
 * GET /api/stripe-portal-diag?k=<key>&email=ivanodonato7@gmail.com
 *
 * Returns profile Stripe fields + live customers.retrieve + portal session attempt.
 */
const Stripe = require("stripe");
const { getServiceClient } = require("./lib/supabaseAdmin.cjs");
const { corsHeaders, siteUrl } = require("./lib/billing.cjs");

const DIAG_KEY = "vestra-portal-diag2-2026-07-22-x7q";

exports.handler = async (event) => {
  const headers = corsHeaders();
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers, body: "" };
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "GET only" }) };
  }

  const qs = event.queryStringParameters || {};
  if (String(qs.k || "").trim() !== DIAG_KEY) {
    return { statusCode: 404, headers, body: JSON.stringify({ error: "Not found" }) };
  }

  const email = String(qs.email || "ivanodonato7@gmail.com").trim().toLowerCase();
  const secret = String(process.env.STRIPE_SECRET_KEY || "").trim();
  const admin = getServiceClient();
  if (!secret || !admin) {
    return {
      statusCode: 503,
      headers,
      body: JSON.stringify({ error: "Stripe or Supabase not configured" }),
    };
  }

  const report = {
    keyMode: secret.startsWith("sk_live_") ? "live" : secret.startsWith("sk_test_") ? "test" : "unknown",
    keyPrefix: secret.slice(0, 8),
    email,
    authUser: null,
    profile: null,
    customerRetrieve: null,
    portalSession: null,
    portalConfigurations: null,
    returnUrl: `${siteUrl(event)}/`,
  };

  // Find auth user by email
  let userId = null;
  try {
    const { data: listed, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (error) throw error;
    const match = (listed?.users || []).find(
      (u) => String(u.email || "").toLowerCase() === email
    );
    if (match) {
      userId = match.id;
      report.authUser = {
        id: match.id,
        email: match.email,
        createdAt: match.created_at || null,
      };
    } else {
      report.authUser = { found: false };
    }
  } catch (err) {
    report.authUser = { error: String(err.message || err).slice(0, 300) };
  }

  if (userId) {
    const { data: profile, error: pErr } = await admin
      .from("profiles")
      .select(
        "id, subscription_status, stripe_customer_id, stripe_subscription_id, updated_at"
      )
      .eq("id", userId)
      .maybeSingle();
    if (pErr) {
      report.profile = { error: pErr.message };
    } else {
      report.profile = profile
        ? {
            id: profile.id,
            subscription_status: profile.subscription_status,
            stripe_customer_id: profile.stripe_customer_id,
            stripe_subscription_id: profile.stripe_subscription_id,
            updated_at: profile.updated_at,
          }
        : { found: false };
    }
  }

  const stripe = new Stripe(secret);

  try {
    const configs = await stripe.billingPortal.configurations.list({ limit: 3 });
    report.portalConfigurations = (configs.data || []).map((c) => ({
      id: c.id,
      active: c.active,
      isDefault: c.is_default,
    }));
  } catch (err) {
    report.portalConfigurations = {
      error: String(err.message || err).slice(0, 300),
      code: err.code || null,
      type: err.type || null,
    };
  }

  const customerId = report.profile?.stripe_customer_id || null;
  if (customerId) {
    try {
      const cust = await stripe.customers.retrieve(customerId);
      report.customerRetrieve = {
        ok: true,
        id: cust.id,
        livemode: cust.livemode,
        deleted: Boolean(cust.deleted),
        email: cust.email || null,
      };
    } catch (err) {
      report.customerRetrieve = {
        ok: false,
        code: err.code || null,
        type: err.type || null,
        message: String(err.message || err).slice(0, 400),
      };
    }

    try {
      const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: report.returnUrl,
      });
      report.portalSession = {
        ok: true,
        id: session.id,
        livemode: session.livemode,
        urlHost: session.url ? new URL(session.url).host : null,
      };
    } catch (err) {
      report.portalSession = {
        ok: false,
        code: err.code || null,
        type: err.type || null,
        message: String(err.message || err).slice(0, 400),
        rawType: err.rawType || null,
        statusCode: err.statusCode || null,
      };
    }
  } else {
    report.customerRetrieve = { skipped: true, reason: "no_stripe_customer_id_on_profile" };
    report.portalSession = { skipped: true, reason: "no_stripe_customer_id_on_profile" };
  }

  // Also list any Pro-looking profiles for context (ids only)
  try {
    const { data: pros } = await admin
      .from("profiles")
      .select("id, subscription_status, stripe_customer_id, stripe_subscription_id")
      .in("subscription_status", ["active", "trialing"])
      .limit(10);
    report.activeProfiles = (pros || []).map((p) => ({
      idPrefix: String(p.id).slice(0, 8),
      idMatch: p.id === userId,
      subscription_status: p.subscription_status,
      stripe_customer_id: p.stripe_customer_id,
      stripe_subscription_id: p.stripe_subscription_id,
    }));
  } catch (err) {
    report.activeProfiles = { error: String(err.message || err).slice(0, 200) };
  }

  console.log("stripe-portal-diag2", JSON.stringify(report));
  return { statusCode: 200, headers, body: JSON.stringify(report, null, 2) };
};
