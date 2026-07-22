/**
 * POST /api/stripe-portal
 * Auth: Bearer Supabase access token
 * Returns: { url } Stripe Customer Portal (manage / cancel)
 */
const Stripe = require("stripe");
const { getServiceClient, userFromAuthHeader } = require("./lib/supabaseAdmin.cjs");
const { corsHeaders, siteUrl } = require("./lib/billing.cjs");

exports.handler = async (event) => {
  const headers = corsHeaders();
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers, body: "" };
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "POST only" }) };
  }

  const secret = String(process.env.STRIPE_SECRET_KEY || "").trim();
  if (!secret) {
    return { statusCode: 503, headers, body: JSON.stringify({ error: "Stripe not configured" }) };
  }

  const user = await userFromAuthHeader(event);
  if (!user) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: "Sign in required" }) };
  }

  const admin = getServiceClient();
  if (!admin) {
    return {
      statusCode: 503,
      headers,
      body: JSON.stringify({ error: "Supabase service role not configured" }),
    };
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.stripe_customer_id) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: "No Stripe customer yet — upgrade to Pro first" }),
    };
  }

  const stripe = new Stripe(secret);
  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `${siteUrl(event)}/`,
    });
    return { statusCode: 200, headers, body: JSON.stringify({ url: session.url }) };
  } catch (err) {
    console.error("stripe-portal error", {
      type: err.type || null,
      code: err.code || null,
      message: String(err.message || err).slice(0, 400),
      customerPrefix: String(profile.stripe_customer_id || "").slice(0, 12),
    });
    return {
      statusCode: 502,
      headers,
      body: JSON.stringify({
        error: "Portal failed",
        detail: String(err.message || err).slice(0, 300),
        code: err.code || null,
        type: err.type || null,
      }),
    };
  }
};
