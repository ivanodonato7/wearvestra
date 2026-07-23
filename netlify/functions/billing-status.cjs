/**
 * GET /api/billing-status
 * Auth: Bearer Supabase access token
 * Returns plan + stylist usage for the signed-in user.
 */
const { getServiceClient, userFromAuthHeader } = require("./lib/supabaseAdmin.cjs");
const {
  corsHeaders,
  checkStylistQuota,
  FREE_STYLIST_LIMIT,
  PRO_STYLIST_SOFT_LIMIT,
} = require("./lib/billing.cjs");

exports.handler = async (event) => {
  const headers = corsHeaders();
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers, body: "" };
  if (event.httpMethod !== "GET" && event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "GET or POST" }) };
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

  try {
    const q = await checkStylistQuota(admin, user.id);
    const defaultLimit = q.pro ? PRO_STYLIST_SOFT_LIMIT : FREE_STYLIST_LIMIT;
    const limit = q.limit ?? defaultLimit;
    const remaining = q.remaining ?? Math.max(0, limit - (Number(q.used) || 0));
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        email: user.email || null,
        pro: q.pro,
        status: q.status,
        stylist: {
          used: q.used,
          limit,
          remaining,
        },
        hasStripeCustomer: Boolean(q.stripeCustomerId),
        prices: {
          monthly: Boolean(process.env.STRIPE_PRICE_MONTHLY),
          yearly: Boolean(process.env.STRIPE_PRICE_YEARLY),
        },
        billingConfigured: Boolean(process.env.STRIPE_SECRET_KEY),
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: String(err.message || err).slice(0, 200) }),
    };
  }
};
