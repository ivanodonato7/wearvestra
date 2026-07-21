/**
 * POST /api/stripe-checkout
 * Body: { price: "monthly" | "yearly" }
 * Auth: Bearer Supabase access token
 * Returns: { url } Stripe Checkout (hosted)
 */
const Stripe = require("stripe");
const { getServiceClient, userFromAuthHeader } = require("./lib/supabaseAdmin.cjs");
const { corsHeaders, siteUrl, allowedPriceIds } = require("./lib/billing.cjs");

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

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  const monthly = String(process.env.STRIPE_PRICE_MONTHLY || "").trim();
  const yearly = String(process.env.STRIPE_PRICE_YEARLY || "").trim();
  const choice = String(body.price || body.plan || "monthly").toLowerCase();
  const priceId = choice === "yearly" || choice === "year" || choice === "annual"
    ? yearly
    : monthly;

  if (!priceId || !allowedPriceIds().includes(priceId)) {
    return {
      statusCode: 503,
      headers,
      body: JSON.stringify({
        error: "Stripe prices not configured",
        detail: "Set STRIPE_PRICE_MONTHLY and STRIPE_PRICE_YEARLY in Netlify",
      }),
    };
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
    .select("stripe_customer_id, name")
    .eq("id", user.id)
    .maybeSingle();

  const stripe = new Stripe(secret);
  const base = siteUrl(event);
  const sessionParams = {
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${base}/?billing=success`,
    cancel_url: `${base}/?billing=cancel`,
    client_reference_id: user.id,
    metadata: { supabase_user_id: user.id },
    subscription_data: {
      metadata: { supabase_user_id: user.id },
    },
    allow_promotion_codes: true,
  };

  if (profile?.stripe_customer_id) {
    sessionParams.customer = profile.stripe_customer_id;
  } else if (user.email) {
    sessionParams.customer_email = user.email;
  }

  try {
    const session = await stripe.checkout.sessions.create(sessionParams);
    return { statusCode: 200, headers, body: JSON.stringify({ url: session.url, id: session.id }) };
  } catch (err) {
    return {
      statusCode: 502,
      headers,
      body: JSON.stringify({ error: "Checkout failed", detail: String(err.message || err).slice(0, 300) }),
    };
  }
};
