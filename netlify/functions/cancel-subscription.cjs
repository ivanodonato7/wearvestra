/**
 * POST /api/cancel-subscription
 * Auth: Bearer Supabase access token
 * Immediately cancels Pro + refunds latest charge.
 */
const Stripe = require("stripe");
const { getServiceClient, userFromAuthHeader } = require("./lib/supabaseAdmin.cjs");
const { corsHeaders } = require("./lib/billing.cjs");
const { cancelProForUser } = require("./lib/cancelPro.cjs");

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

  const stripe = new Stripe(secret);
  try {
    const result = await cancelProForUser({ stripe, admin, userId: user.id });
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true, ...result }),
    };
  } catch (err) {
    const code = err.code || "cancel_failed";
    const status =
      code === "not_pro" ||
      code === "no_subscription" ||
      code === "profile_missing" ||
      code === "no_refundable_payment"
        ? 400
        : 502;
    console.error("cancel-subscription error", {
      code,
      message: String(err.message || err).slice(0, 400),
      userIdPrefix: String(user.id || "").slice(0, 8),
    });
    return {
      statusCode: status,
      headers,
      body: JSON.stringify({
        error: String(err.message || "Cancel failed").slice(0, 300),
        code,
      }),
    };
  }
};
