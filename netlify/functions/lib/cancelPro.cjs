/**
 * Shared Vestra Pro cancel + refund helpers (used by cancel-subscription + delete-account).
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
 * Immediately cancel the user's Stripe subscription (if any) and refund the
 * latest paid invoice. Updates profile to free and clears stripe_subscription_id.
 * Keeps stripe_customer_id.
 *
 * @returns {{ canceled: boolean, subscriptionId: string|null, refundId: string|null, refunded: boolean }}
 */
async function cancelProForUser({ stripe, admin, userId, allowNotPro = false } = {}) {
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
  const isProish = ["active", "trialing", "past_due"].includes(status);
  if (!isProish) {
    if (allowNotPro) {
      return { canceled: false, subscriptionId: null, refundId: null, refunded: false };
    }
    const err = new Error("No active Pro subscription to cancel");
    err.code = "not_pro";
    throw err;
  }

  let subscriptionId = profile.stripe_subscription_id || null;
  const customerId = profile.stripe_customer_id || null;

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
    // Mark free locally even if Stripe sub id is missing
    await admin
      .from("profiles")
      .update({
        subscription_status: "free",
        stripe_subscription_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);
    if (allowNotPro) {
      return { canceled: false, subscriptionId: null, refundId: null, refunded: false };
    }
    const err = new Error("No Stripe subscription on file");
    err.code = "no_subscription";
    throw err;
  }

  let refundTarget = null;
  try {
    refundTarget = await findLatestRefundablePayment(stripe, { customerId, subscriptionId });
  } catch (err) {
    console.error("cancelPro invoice lookup failed", err.message);
  }

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
      console.error("cancelPro refund failed", { code: err.code, message: err.message });
      // Still free the profile — subscription is already canceled
      await admin
        .from("profiles")
        .update({
          subscription_status: "free",
          stripe_subscription_id: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId);
      const soft = new Error(
        `Subscription canceled but refund failed: ${String(err.message || err).slice(0, 200)}`
      );
      soft.code = "refund_failed";
      soft.subscriptionId = canceled.id;
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
    canceled: true,
    subscriptionId: canceled.id,
    refundId: refund?.id || null,
    refunded: Boolean(refund?.id),
  };
}

module.exports = {
  findLatestRefundablePayment,
  cancelProForUser,
};
