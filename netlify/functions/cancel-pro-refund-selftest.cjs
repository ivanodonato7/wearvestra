/**
 * Gated Stripe TEST-MODE self-test for cancel-pro refund fix.
 * POST /api/cancel-pro-refund-selftest
 * Header: x-vestra-gate: <CANCEL_PRO_SELFTEST_GATE>
 *
 * Body (optional):
 *   { "stripeSecretKey": "sk_test_…", "priceId": "price_…" }
 * Falls back to env STRIPE_SECRET_KEY / STRIPE_PRICE_MONTHLY (must be sk_test_).
 *
 * Creates a throwaway customer+subscription, runs cancelProForUser, returns refund.
 * REMOVE after verification.
 */
const Stripe = require("stripe");
const { corsHeaders } = require("./lib/billing.cjs");
const { cancelProForUser } = require("./lib/cancelPro.cjs");

function mockAdmin(profile) {
  return {
    from() {
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        async maybeSingle() {
          return { data: profile, error: null };
        },
        update(payload) {
          Object.assign(profile, payload);
          return {
            eq() {
              return Promise.resolve({ error: null });
            },
          };
        },
      };
    },
  };
}

exports.handler = async (event) => {
  const headers = corsHeaders();
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers, body: "" };
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "POST only" }) };
  }

  const gate = String(process.env.CANCEL_PRO_SELFTEST_GATE || "").trim();
  const got = String(event.headers["x-vestra-gate"] || event.headers["X-Vestra-Gate"] || "").trim();
  if (!gate || got !== gate) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: "Unauthorized" }) };
  }

  let body = {};
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    body = {};
  }

  const secret = String(body.stripeSecretKey || process.env.STRIPE_SECRET_KEY || "").trim();
  const priceId = String(body.priceId || process.env.STRIPE_PRICE_MONTHLY || "").trim();

  if (!secret.startsWith("sk_test_")) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({
        error: "sk_test_ required (refusing live keys)",
        envKeyMode: String(process.env.STRIPE_SECRET_KEY || "").startsWith("sk_live_")
          ? "live"
          : String(process.env.STRIPE_SECRET_KEY || "").startsWith("sk_test_")
            ? "test"
            : "missing",
      }),
    };
  }
  if (!priceId.startsWith("price_")) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: "priceId / STRIPE_PRICE_MONTHLY required" }),
    };
  }

  const stripe = new Stripe(secret);
  try {
    const customer = await stripe.customers.create({
      email: `cancel-pro-selftest+${Date.now()}@wearvestra.test`,
      metadata: { purpose: "cancel_pro_refund_selftest" },
    });
    const attached = await stripe.paymentMethods.attach("pm_card_visa", { customer: customer.id });
    await stripe.customers.update(customer.id, {
      invoice_settings: { default_payment_method: attached.id },
    });

    const sub = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: priceId }],
      payment_behavior: "error_if_incomplete",
      expand: ["latest_invoice.payments"],
      metadata: { purpose: "cancel_pro_refund_selftest" },
    });

    const invoiceId =
      typeof sub.latest_invoice === "string" ? sub.latest_invoice : sub.latest_invoice?.id;
    const invoice = await stripe.invoices.retrieve(invoiceId, { expand: ["payments"] });

    const profile = {
      subscription_status: "active",
      stripe_customer_id: customer.id,
      stripe_subscription_id: sub.id,
    };
    const result = await cancelProForUser({
      stripe,
      admin: mockAdmin(profile),
      userId: "00000000-0000-4000-8000-000000000099",
    });

    const refund = result.refundId
      ? await stripe.refunds.retrieve(result.refundId)
      : null;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        apiVersion: stripe._api?.version || null,
        customerId: customer.id,
        subscriptionId: sub.id,
        invoiceProbe: {
          id: invoice.id,
          status: invoice.status,
          hasTopLevelPaymentIntent: Object.prototype.hasOwnProperty.call(invoice, "payment_intent"),
          hasTopLevelCharge: Object.prototype.hasOwnProperty.call(invoice, "charge"),
          payments: (invoice.payments?.data || []).map((p) => ({
            id: p.id,
            status: p.status,
            type: p.payment?.type,
            payment_intent:
              typeof p.payment?.payment_intent === "string"
                ? p.payment.payment_intent
                : p.payment?.payment_intent?.id || null,
          })),
        },
        cancelResult: result,
        refund,
      }),
    };
  } catch (err) {
    console.error("cancel-pro-refund-selftest", err);
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
