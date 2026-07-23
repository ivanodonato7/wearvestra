/**
 * TEMP one-shot: create a Stripe refund for a known PaymentIntent/Charge.
 * POST /api/cancel-pro-refund-oneshot
 * Header: x-vestra-gate: vestra-cancel-pro-selftest-2026-07-23
 * Body: { "paymentIntent": "pi_…", "charge": "ch_…" } (one required)
 */
const Stripe = require("stripe");
const { corsHeaders } = require("./lib/billing.cjs");

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

  const paymentIntent = String(body.paymentIntent || "").trim() || null;
  const charge = String(body.charge || "").trim() || null;
  const action = String(body.action || "create").trim();
  if (!paymentIntent && !charge) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: "paymentIntent or charge required" }),
    };
  }

  const stripe = new Stripe(secret);
  try {
    if (action === "list") {
      const listParams = { limit: 10 };
      if (paymentIntent) listParams.payment_intent = paymentIntent;
      if (charge) listParams.charge = charge;
      const listed = await stripe.refunds.list(listParams);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          ok: true,
          action: "list",
          keyMode: secret.startsWith("sk_live_") ? "live" : "test",
          refunds: listed.data,
        }),
      };
    }

    const refundParams = paymentIntent
      ? { payment_intent: paymentIntent }
      : { charge };
    console.log("cancel-pro-refund-oneshot attempt", refundParams);
    const refund = await stripe.refunds.create({
      ...refundParams,
      reason: "requested_by_customer",
      metadata: {
        purpose: "cancel_pro_refund_oneshot_missed_refund",
      },
    });
    console.log("cancel-pro-refund-oneshot success", { id: refund.id, status: refund.status });
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        keyMode: secret.startsWith("sk_live_") ? "live" : "test",
        refund,
      }),
    };
  } catch (err) {
    console.error("cancel-pro-refund-oneshot failed", {
      code: err.code,
      message: err.message,
    });
    return {
      statusCode: 502,
      headers,
      body: JSON.stringify({
        error: String(err.message || err).slice(0, 400),
        code: err.code || null,
        type: err.type || null,
      }),
    };
  }
};
