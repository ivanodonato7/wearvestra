/**
 * POST /api/cancel-subscription
 * Auth: Bearer Supabase access token
 *
 * Immediately cancels the signed-in user's Stripe subscription, refunds the
 * most recent paid invoice/charge, and sets profiles.subscription_status to free.
 * Keeps stripe_customer_id for future resubscribes.
 */
const Stripe = require("stripe");
const { getServiceClient, userFromAuthHeader } = require("./lib/supabaseAdmin.cjs");
const { corsHeaders } = require("./lib/billing.cjs");

/**
 * Find the most recent refundable payment for a subscription/customer.
 * @returns {{ paymentIntent?: string, charge?: string, invoiceId?: string } | null}
 */
async function findLatestRefundablePayment(stripe, { customerId, subscriptionId }) {
  const listParams = { limit: 5, status: "paid" };
  if (subscriptionId) listParams.subscription = subscriptionId;
  else if (customerId) listParams.customer = customerId;
  else return null;

  const invoices = await stripe.invoices.list(listParams);
  for (const inv of invoices.data || []) {
    const paymentIntent = typeof inv.payment_intent === "string"
      ? inv.payment_intent
      : inv.payment_intent?.id || null;
    const charge = typeof inv.charge === "string"
      ? inv.charge
      : inv.charge?.id || null;
    if (paymentIntent || charge) {
      return { paymentIntent, charge, invoiceId: inv.id };
    }
  }
  return null;
}

/**
 * Core cancel + refund + profile update. Exported for tests.
 */
async function cancelProForUser({ stripe, admin, userId }) {
  const { data: profile, error: profileErr } = await admin
    .from("profiles")
    .select("subscription_status, stripe_customer_id, stripe_subscription_id")
    .eq("id", userId)
    .maybeSingle();
  if (profileErr) throw profileErr;

  if (!profile) {
    const err = new Error("Profile not found");
    err.code = "profile_missing";
    throw err;
  }

  const status = String(profile.subscription_status || "").toLowerCase();
  if (status !== "active" && status !== "trialing" && status !== "past_due") {
    const err = new Error("No active Pro subscription to cancel");
    err.code = "not_pro";
    throw err;
  }

  let subscriptionId = profile.stripe_subscription_id || null;
  const customerId = profile.stripe_customer_id || null;

  // Resolve subscription from Stripe if profile id is missing but customer exists
  if (!subscriptionId && customerId) {
    const subs = await stripe.subscriptions.list({
      customer: customerId,
      status: "all",
      limit: 10,
    });
    const open = (subs.data || []).find((s) =>
      ["active", "trialing", "past_due", "unpaid", "incomplete"].includes(s.status)
    );
    if (open) subscriptionId = open.id;
  }

  if (!subscriptionId) {
    const err = new Error("No Stripe subscription on file");
    err.code = "no_subscription";
    throw err;
  }

  // Capture refund target before cancel (invoice still linked to subscription)
  let refundTarget = null;
  try {
    refundTarget = await findLatestRefundablePayment(stripe, { customerId, subscriptionId });
  } catch (err) {
    console.error("cancel-subscription invoice lookup failed", err.message);
  }

  // Immediate cancel (not cancel_at_period_end)
  const canceled = await stripe.subscriptions.cancel(subscriptionId);

  let refund = null;
  if (refundTarget?.paymentIntent || refundTarget?.charge) {
    try {
      const refundParams = refundTarget.paymentIntent
        ? { payment_intent: refundTarget.paymentIntent }
        : { charge: refundTarget.charge };
      refund = await stripe.refunds.create({
        ...refundParams,
        reason: "requested_by_customer",
        metadata: {
          supabase_user_id: userId,
          invoice_id: refundTarget.invoiceId || "",
          subscription_id: subscriptionId,
        },
      });
    } catch (err) {
      // Subscription already canceled — surface refund failure but still free the profile
      console.error("cancel-subscription refund failed", {
        code: err.code,
        message: err.message,
      });
      const soft = new Error(
        `Subscription canceled but refund failed: ${String(err.message || err).slice(0, 200)}`
      );
      soft.code = "refund_failed";
      soft.subscriptionId = canceled.id;
      // Still update profile to free so UI is correct
      await admin
        .from("profiles")
        .update({
          subscription_status: "free",
          stripe_subscription_id: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId);
      throw soft;
    }
  }

  const { error: upErr } = await admin
    .from("profiles")
    .update({
      subscription_status: "free",
      stripe_subscription_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);
  if (upErr) throw upErr;

  return {
    ok: true,
    subscriptionId: canceled.id,
    subscriptionStatus: canceled.status,
    refundId: refund?.id || null,
    refunded: Boolean(refund?.id),
    customerIdKept: Boolean(customerId),
  };
}

exports.cancelProForUser = cancelProForUser;
exports.findLatestRefundablePayment = findLatestRefundablePayment;

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
    return { statusCode: 200, headers, body: JSON.stringify(result) };
  } catch (err) {
    const code = err.code || "cancel_failed";
    const status =
      code === "not_pro" || code === "no_subscription" || code === "profile_missing"
        ? 400
        : code === "refund_failed"
          ? 502
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
