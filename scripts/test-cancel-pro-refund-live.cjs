/**
 * Live Stripe TEST-MODE cancel + refund exercise.
 *
 * Requires: STRIPE_SECRET_KEY=sk_test_…  (and optionally STRIPE_PRICE_MONTHLY)
 *
 * Creates a throwaway customer + subscription with pm_card_visa, then runs
 * cancelProForUser and prints the refund object. Cleans nothing beyond cancel
 * (customer left for dashboard inspection).
 *
 * Usage:
 *   STRIPE_SECRET_KEY=sk_test_… STRIPE_PRICE_MONTHLY=price_… \
 *     node scripts/test-cancel-pro-refund-live.cjs
 */
const Stripe = require("stripe");
const { cancelProForUser } = require("../netlify/functions/lib/cancelPro.cjs");

function mockAdmin(profile) {
  const updates = [];
  return {
    updates,
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
          updates.push(payload);
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

async function main() {
  const secret = String(process.env.STRIPE_SECRET_KEY || "").trim();
  if (!secret.startsWith("sk_test_")) {
    console.error("Refusing to run: set STRIPE_SECRET_KEY to a sk_test_… key (test mode only).");
    process.exit(2);
  }

  const priceId = String(process.env.STRIPE_PRICE_MONTHLY || "").trim();
  if (!priceId.startsWith("price_")) {
    console.error("Set STRIPE_PRICE_MONTHLY=price_… (test-mode Vestra Pro monthly).");
    process.exit(2);
  }

  const stripe = new Stripe(secret);
  console.log("stripe apiVersion", stripe._api?.version || "(default)");

  const customer = await stripe.customers.create({
    email: `cancel-pro-refund-test+${Date.now()}@wearvestra.test`,
    name: "Cancel Pro Refund Test",
    metadata: { purpose: "cancel_pro_refund_live_test" },
  });
  console.log("customer", customer.id);

  const pm = await stripe.paymentMethods.attach("pm_card_visa", {
    customer: customer.id,
  });
  await stripe.customers.update(customer.id, {
    invoice_settings: { default_payment_method: pm.id },
  });

  const sub = await stripe.subscriptions.create({
    customer: customer.id,
    items: [{ price: priceId }],
    payment_behavior: "error_if_incomplete",
    expand: ["latest_invoice.payments"],
    metadata: { purpose: "cancel_pro_refund_live_test" },
  });
  console.log("subscription", {
    id: sub.id,
    status: sub.status,
    latest_invoice: typeof sub.latest_invoice === "string" ? sub.latest_invoice : sub.latest_invoice?.id,
  });

  // Inspect invoice payment shape for evidence in the report
  const invoiceId = typeof sub.latest_invoice === "string" ? sub.latest_invoice : sub.latest_invoice?.id;
  const invoice = await stripe.invoices.retrieve(invoiceId, { expand: ["payments"] });
  console.log("invoice shape sample", JSON.stringify({
    id: invoice.id,
    status: invoice.status,
    amount_paid: invoice.amount_paid,
    has_top_level_payment_intent: Object.prototype.hasOwnProperty.call(invoice, "payment_intent"),
    has_top_level_charge: Object.prototype.hasOwnProperty.call(invoice, "charge"),
    top_level_payment_intent: invoice.payment_intent ?? null,
    top_level_charge: invoice.charge ?? null,
    payments: (invoice.payments?.data || []).map((p) => ({
      id: p.id,
      status: p.status,
      type: p.payment?.type,
      payment_intent: typeof p.payment?.payment_intent === "string"
        ? p.payment.payment_intent
        : p.payment?.payment_intent?.id || null,
      charge: typeof p.payment?.charge === "string"
        ? p.payment.charge
        : p.payment?.charge?.id || null,
    })),
  }, null, 2));

  const profile = {
    subscription_status: "active",
    stripe_customer_id: customer.id,
    stripe_subscription_id: sub.id,
  };
  const admin = mockAdmin(profile);

  const result = await cancelProForUser({
    stripe,
    admin,
    userId: "00000000-0000-4000-8000-000000000001",
  });

  console.log("cancelProForUser result", result);

  if (!result.refundId) {
    console.error("FAIL: expected a refundId");
    process.exit(1);
  }

  const refund = await stripe.refunds.retrieve(result.refundId);
  console.log("REFUND_OBJECT", JSON.stringify(refund, null, 2));
  console.log("REFUND_ID", refund.id);
}

main().catch((err) => {
  console.error("LIVE TEST FAILED", {
    code: err.code,
    type: err.type,
    message: err.message,
  });
  process.exit(1);
});
