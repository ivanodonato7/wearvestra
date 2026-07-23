/**
 * TEMP read-only probe: prove findLatestRefundablePayment against live Stripe.
 * POST /api/cancel-pro-refund-probe
 * Header: x-vestra-gate: vestra-cancel-pro-selftest-2026-07-23
 * Body: { "customerId": "cus_…", "subscriptionId": "sub_…" } (subscription optional)
 * Does NOT cancel or refund.
 */
const Stripe = require("stripe");
const { corsHeaders } = require("./lib/billing.cjs");
const { findLatestRefundablePayment } = require("./lib/cancelPro.cjs");

exports.handler = async (event) => {
  const headers = corsHeaders();
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers, body: "" };
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "POST only" }) };
  }

  const gate = String(process.env.CANCEL_PRO_SELFTEST_GATE || "vestra-cancel-pro-selftest-2026-07-23").trim();
  const got = String(event.headers["x-vestra-gate"] || event.headers["X-Vestra-Gate"] || "").trim();
  if (got !== gate) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: "Unauthorized" }) };
  }

  const secret = String(process.env.STRIPE_SECRET_KEY || "").trim();
  if (!secret) {
    return { statusCode: 503, headers, body: JSON.stringify({ error: "Stripe not configured" }) };
  }

  let body = {};
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    body = {};
  }

  const customerId = String(body.customerId || "").trim() || null;
  const subscriptionId = String(body.subscriptionId || "").trim() || null;
  if (!customerId && !subscriptionId) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: "customerId or subscriptionId required" }),
    };
  }

  const stripe = new Stripe(secret);
  try {
    // Also dump raw invoice shape for evidence
    const listParams = {
      limit: 3,
      status: "paid",
      expand: ["data.payments"],
    };
    if (subscriptionId) listParams.subscription = subscriptionId;
    else listParams.customer = customerId;

    const invoices = await stripe.invoices.list(listParams);
    const sample = (invoices.data || []).map((inv) => ({
      id: inv.id,
      status: inv.status,
      amount_paid: inv.amount_paid,
      hasTopLevelPaymentIntent: Object.prototype.hasOwnProperty.call(inv, "payment_intent"),
      hasTopLevelCharge: Object.prototype.hasOwnProperty.call(inv, "charge"),
      topLevelPaymentIntent: inv.payment_intent ?? null,
      topLevelCharge: inv.charge ?? null,
      paymentsCount: inv.payments?.data?.length ?? null,
      payments: (inv.payments?.data || []).map((p) => ({
        id: p.id,
        status: p.status,
        type: p.payment?.type,
        payment_intent:
          typeof p.payment?.payment_intent === "string"
            ? p.payment.payment_intent
            : p.payment?.payment_intent?.id || null,
        charge:
          typeof p.payment?.charge === "string"
            ? p.payment.charge
            : p.payment?.charge?.id || null,
      })),
    }));

    const target = await findLatestRefundablePayment(stripe, { customerId, subscriptionId });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        keyMode: secret.startsWith("sk_live_") ? "live" : secret.startsWith("sk_test_") ? "test" : "other",
        apiVersion: stripe._api?.version || null,
        customerId,
        subscriptionId,
        invoiceSample: sample,
        findLatestRefundablePayment: target,
        wouldCallRefundsCreate: Boolean(target?.paymentIntent || target?.charge),
      }),
    };
  } catch (err) {
    console.error("cancel-pro-refund-probe", err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: String(err.message || err).slice(0, 400),
        code: err.code || null,
      }),
    };
  }
};
