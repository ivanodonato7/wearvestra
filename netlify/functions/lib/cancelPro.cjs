/**
 * Shared Vestra Pro cancel + refund helpers (used by cancel-subscription + delete-account).
 *
 * Stripe API note (stripe@22 / 2026-*-dahlia "basil"):
 * Invoice no longer has top-level `payment_intent` or `charge`.
 * Refundable IDs live on InvoicePayment under `payment.payment_intent` / `payment.charge`.
 * See node_modules/stripe/CHANGELOG.md (basil) and InvoicePayments.d.ts.
 */

function idOf(value) {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof value === "object" && value.id) return String(value.id);
  return null;
}

/**
 * Extract a refundable PaymentIntent or Charge from an InvoicePayment-shaped object.
 * Shape (InvoicePayments.d.ts):
 *   payment.payment_intent?: string | PaymentIntent
 *   payment.charge?: string | Charge
 *   payment.type: 'payment_intent' | 'charge' | 'payment_record'
 */
function refundTargetFromInvoicePayment(pay, invoiceId) {
  if (!pay) return null;
  if (String(pay.status || "").toLowerCase() === "canceled") {
    return { rejected: "payment_status_canceled" };
  }
  const payment = pay.payment || {};
  const paymentIntent = idOf(payment.payment_intent);
  const charge = idOf(payment.charge);
  if (paymentIntent || charge) {
    return {
      paymentIntent,
      charge,
      invoiceId,
      invoicePaymentId: pay.id || null,
      paymentStatus: pay.status || null,
    };
  }
  return {
    rejected: `no_pi_or_charge (type=${payment.type || "unknown"})`,
  };
}

/**
 * List InvoicePayment rows for an invoice (expanded list, or invoicePayments API).
 */
async function listInvoicePayments(stripe, invoice) {
  const expanded = invoice?.payments?.data;
  if (Array.isArray(expanded) && expanded.length) {
    return { source: "invoice.payments", data: expanded };
  }
  if (!invoice?.id) return { source: "none", data: [] };
  try {
    const listed = await stripe.invoicePayments.list({
      invoice: invoice.id,
      status: "paid",
      limit: 10,
    });
    return { source: "invoicePayments.list", data: listed?.data || [] };
  } catch (err) {
    // Fallback without status filter (older edge cases)
    try {
      const listed = await stripe.invoicePayments.list({
        invoice: invoice.id,
        limit: 10,
      });
      return { source: "invoicePayments.list(all)", data: listed?.data || [] };
    } catch (err2) {
      console.error("cancelPro invoicePayments.list failed", {
        invoiceId: invoice.id,
        message: String(err2.message || err2).slice(0, 300),
        code: err2.code || null,
      });
      return { source: "invoicePayments.error", data: [], error: String(err2.message || err2) };
    }
  }
}

/**
 * Find the latest refundable PaymentIntent/Charge for a subscription (or customer).
 * @returns {Promise<{paymentIntent:string|null, charge:string|null, invoiceId:string, invoicePaymentId:string|null}|null>}
 */
async function findLatestRefundablePayment(stripe, { customerId, subscriptionId }) {
  const listParams = {
    limit: 5,
    status: "paid",
    expand: ["data.payments"],
  };
  if (subscriptionId) listParams.subscription = subscriptionId;
  else if (customerId) listParams.customer = customerId;
  else {
    console.error("cancelPro findLatestRefundablePayment: no customerId or subscriptionId");
    return null;
  }

  const invoices = await stripe.invoices.list(listParams);
  const rows = invoices?.data || [];
  const rejections = [];

  for (const inv of rows) {
    const { source, data: payments, error } = await listInvoicePayments(stripe, inv);
    if (error) {
      rejections.push({ invoiceId: inv.id, reason: `payments_fetch_error: ${error}`, source });
      continue;
    }
    if (!payments.length) {
      rejections.push({
        invoiceId: inv.id,
        reason: "no_payments",
        source,
        amountPaid: inv.amount_paid ?? null,
        status: inv.status || null,
      });
      continue;
    }

    // Prefer paid payments; keep order from Stripe (typically newest first within list)
    const ordered = [...payments].sort((a, b) => {
      const ta = a?.status_transitions?.paid_at || a?.created || 0;
      const tb = b?.status_transitions?.paid_at || b?.created || 0;
      return tb - ta;
    });

    for (const pay of ordered) {
      const extracted = refundTargetFromInvoicePayment(pay, inv.id);
      if (extracted?.paymentIntent || extracted?.charge) {
        console.log("cancelPro findLatestRefundablePayment: found", {
          invoiceId: inv.id,
          invoicePaymentId: extracted.invoicePaymentId,
          paymentIntent: extracted.paymentIntent,
          charge: extracted.charge,
          source,
          invoicesChecked: rows.length,
        });
        return extracted;
      }
      rejections.push({
        invoiceId: inv.id,
        invoicePaymentId: pay.id || null,
        reason: extracted?.rejected || "unusable_payment",
        source,
      });
    }
  }

  console.error("cancelPro findLatestRefundablePayment: nothing refundable", {
    customerId: customerId || null,
    subscriptionId: subscriptionId || null,
    invoiceCount: rows.length,
    rejections,
  });
  return null;
}

/**
 * Immediately cancel the user's Stripe subscription (if any) and refund the
 * latest paid invoice payment. Updates profile to free and clears stripe_subscription_id.
 * Keeps stripe_customer_id.
 *
 * Throws with code `no_refundable_payment` if cancel would succeed but no charge/PI
 * could be found to refund (never silently returns refunded:false).
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
    console.error("cancelPro invoice lookup failed", {
      message: String(err.message || err).slice(0, 400),
      code: err.code || null,
      subscriptionId,
      customerId,
    });
    const soft = new Error(
      `Could not look up payment to refund: ${String(err.message || err).slice(0, 200)}`
    );
    soft.code = "refund_lookup_failed";
    soft.subscriptionId = subscriptionId;
    throw soft;
  }

  if (!refundTarget?.paymentIntent && !refundTarget?.charge) {
    const err = new Error(
      "Subscription is active but no refundable payment was found on recent invoices. Cancel aborted so we do not leave a charge without a refund."
    );
    err.code = "no_refundable_payment";
    err.subscriptionId = subscriptionId;
    console.error("cancelPro aborting cancel — no refundable payment", {
      userIdPrefix: String(userId || "").slice(0, 8),
      subscriptionId,
      customerId,
    });
    throw err;
  }

  console.log("cancelPro refund attempt", {
    userIdPrefix: String(userId || "").slice(0, 8),
    subscriptionId,
    invoiceId: refundTarget.invoiceId,
    invoicePaymentId: refundTarget.invoicePaymentId,
    paymentIntent: refundTarget.paymentIntent,
    charge: refundTarget.charge,
  });

  const canceled = await stripe.subscriptions.cancel(subscriptionId);

  let refund = null;
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
        invoice_payment_id: refundTarget.invoicePaymentId || "",
        subscription_id: subscriptionId,
      },
    });
    console.log("cancelPro refund success", {
      refundId: refund?.id || null,
      status: refund?.status || null,
      amount: refund?.amount ?? null,
      currency: refund?.currency || null,
      paymentIntent: refund?.payment_intent || refundTarget.paymentIntent,
      charge: refund?.charge || refundTarget.charge,
    });
  } catch (err) {
    console.error("cancelPro refund failed", {
      code: err.code || null,
      type: err.type || null,
      message: String(err.message || err).slice(0, 400),
      subscriptionId: canceled.id,
      paymentIntent: refundTarget.paymentIntent,
      charge: refundTarget.charge,
    });
    // Subscription is already canceled — free the profile, still surface failure
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

  if (!refund?.id) {
    await admin
      .from("profiles")
      .update({
        subscription_status: "free",
        stripe_subscription_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);
    const soft = new Error("Subscription canceled but Stripe returned no refund id");
    soft.code = "refund_failed";
    soft.subscriptionId = canceled.id;
    throw soft;
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
    refundId: refund.id,
    refunded: true,
  };
}

module.exports = {
  findLatestRefundablePayment,
  cancelProForUser,
  refundTargetFromInvoicePayment,
};
