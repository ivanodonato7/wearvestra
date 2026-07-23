/**
 * Unit tests for cancelPro refund lookup (basil Invoice.payments shape).
 * Usage: node scripts/test-cancel-pro-refund.cjs
 */
const assert = require("assert");
const {
  findLatestRefundablePayment,
  cancelProForUser,
  refundTargetFromInvoicePayment,
} = require("../netlify/functions/lib/cancelPro.cjs");

function modernPaidInvoice({
  id = "in_1",
  paymentIntent = "pi_1",
  charge = null,
  paymentStatus = "paid",
} = {}) {
  return {
    id,
    status: "paid",
    amount_paid: 899,
    payments: {
      object: "list",
      data: [
        {
          id: "inpay_1",
          status: paymentStatus,
          created: 1_700_000_000,
          status_transitions: { paid_at: 1_700_000_000, canceled_at: null },
          payment: {
            type: paymentIntent ? "payment_intent" : "charge",
            payment_intent: paymentIntent || undefined,
            charge: charge || undefined,
          },
        },
      ],
    },
  };
}

function profileAdmin(profile, updates) {
  return {
    from(table) {
      assert.strictEqual(table, "profiles");
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        async maybeSingle() {
          return { data: { ...profile }, error: null };
        },
        update(payload) {
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

async function testExtractFromInvoicePayment() {
  const ok = refundTargetFromInvoicePayment(
    {
      id: "inpay_1",
      status: "paid",
      payment: { type: "payment_intent", payment_intent: "pi_abc" },
    },
    "in_1"
  );
  assert.strictEqual(ok.paymentIntent, "pi_abc");
  assert.strictEqual(ok.invoiceId, "in_1");

  const legacyCharge = refundTargetFromInvoicePayment(
    {
      id: "inpay_2",
      status: "paid",
      payment: { type: "charge", charge: "ch_abc" },
    },
    "in_2"
  );
  assert.strictEqual(legacyCharge.charge, "ch_abc");

  const rejected = refundTargetFromInvoicePayment(
    { id: "inpay_3", status: "paid", payment: { type: "payment_record" } },
    "in_3"
  );
  assert.ok(rejected.rejected);
  console.log("ok refundTargetFromInvoicePayment nested shape");
}

async function testFindUsesPaymentsNotTopLevel() {
  const stripe = {
    invoices: {
      async list(params) {
        assert.deepStrictEqual(params.expand, ["data.payments"]);
        assert.strictEqual(params.status, "paid");
        // Modern invoice: NO top-level payment_intent/charge
        return {
          data: [
            {
              id: "in_oldshape_gone",
              status: "paid",
              // intentionally no payment_intent / charge
              payments: {
                data: [
                  {
                    id: "inpay_x",
                    status: "paid",
                    created: 2,
                    payment: { type: "payment_intent", payment_intent: "pi_from_payments" },
                  },
                ],
              },
            },
          ],
        };
      },
    },
  };
  const target = await findLatestRefundablePayment(stripe, {
    customerId: "cus_1",
    subscriptionId: "sub_1",
  });
  assert.strictEqual(target.paymentIntent, "pi_from_payments");
  assert.strictEqual(target.invoiceId, "in_oldshape_gone");
  console.log("ok findLatestRefundablePayment reads invoice.payments[]");
}

async function testFindFallsBackToInvoicePaymentsApi() {
  const stripe = {
    invoices: {
      async list() {
        return {
          data: [{ id: "in_bare", status: "paid", amount_paid: 899 }],
        };
      },
    },
    invoicePayments: {
      async list(params) {
        assert.strictEqual(params.invoice, "in_bare");
        return {
          data: [
            {
              id: "inpay_listed",
              status: "paid",
              created: 9,
              payment: { type: "payment_intent", payment_intent: "pi_listed" },
            },
          ],
        };
      },
    },
  };
  const target = await findLatestRefundablePayment(stripe, {
    subscriptionId: "sub_1",
  });
  assert.strictEqual(target.paymentIntent, "pi_listed");
  console.log("ok findLatestRefundablePayment falls back to invoicePayments.list");
}

async function testFindReturnsNullAndLogsRejections() {
  const stripe = {
    invoices: {
      async list() {
        return {
          data: [
            {
              id: "in_empty",
              status: "paid",
              amount_paid: 899,
              payments: { data: [] },
            },
          ],
        };
      },
    },
    invoicePayments: {
      async list() {
        return { data: [] };
      },
    },
  };
  const target = await findLatestRefundablePayment(stripe, {
    subscriptionId: "sub_1",
  });
  assert.strictEqual(target, null);
  console.log("ok findLatestRefundablePayment returns null when nothing refundable");
}

async function testCancelProRefundsViaPayments() {
  const updates = [];
  const admin = profileAdmin(
    {
      subscription_status: "active",
      stripe_customer_id: "cus_1",
      stripe_subscription_id: "sub_1",
    },
    updates
  );
  const created = [];
  const stripe = {
    subscriptions: {
      async cancel(id) {
        return { id };
      },
    },
    invoices: {
      async list() {
        return { data: [modernPaidInvoice({ paymentIntent: "pi_1" })] };
      },
    },
    refunds: {
      async create(params) {
        created.push(params);
        return {
          id: "re_1",
          status: "succeeded",
          amount: 899,
          currency: "usd",
          payment_intent: params.payment_intent,
        };
      },
    },
  };
  const result = await cancelProForUser({ stripe, admin, userId: "user-1" });
  assert.strictEqual(result.refunded, true);
  assert.strictEqual(result.refundId, "re_1");
  assert.strictEqual(created[0].payment_intent, "pi_1");
  assert.ok(updates.some((u) => u.subscription_status === "free"));
  console.log("ok cancelProForUser refunds via payments[].payment.payment_intent");
}

async function testCancelAbortsWithoutRefundTarget() {
  const updates = [];
  const admin = profileAdmin(
    {
      subscription_status: "active",
      stripe_customer_id: "cus_1",
      stripe_subscription_id: "sub_1",
    },
    updates
  );
  let canceled = false;
  const stripe = {
    subscriptions: {
      async cancel(id) {
        canceled = true;
        return { id };
      },
    },
    invoices: {
      async list() {
        return {
          data: [
            {
              id: "in_nopay",
              status: "paid",
              amount_paid: 899,
              payments: { data: [] },
            },
          ],
        };
      },
    },
    invoicePayments: {
      async list() {
        return { data: [] };
      },
    },
    refunds: {
      async create() {
        throw new Error("should not refund");
      },
    },
  };
  let err = null;
  try {
    await cancelProForUser({ stripe, admin, userId: "user-1" });
  } catch (e) {
    err = e;
  }
  assert.ok(err);
  assert.strictEqual(err.code, "no_refundable_payment");
  assert.strictEqual(canceled, false, "must not cancel subscription when refund target missing");
  assert.strictEqual(updates.length, 0, "must not free profile when aborting");
  console.log("ok cancelProForUser aborts with no_refundable_payment (no silent success)");
}

async function testLegacyTopLevelFieldsAloneAreNotEnough() {
  // Regression: old code only read inv.payment_intent — ensure we don't depend on it
  const stripe = {
    invoices: {
      async list() {
        return {
          data: [
            {
              id: "in_legacy_fields_only",
              status: "paid",
              payment_intent: "pi_should_be_ignored_if_payments_empty",
              charge: "ch_ignored",
              payments: { data: [] },
            },
          ],
        };
      },
    },
    invoicePayments: {
      async list() {
        return { data: [] };
      },
    },
  };
  const target = await findLatestRefundablePayment(stripe, { subscriptionId: "sub_1" });
  // With empty payments[], we correctly find nothing (API no longer puts PI on invoice)
  assert.strictEqual(target, null);
  console.log("ok does not rely on removed Invoice.payment_intent top-level fields");
}

async function main() {
  await testExtractFromInvoicePayment();
  await testFindUsesPaymentsNotTopLevel();
  await testFindFallsBackToInvoicePaymentsApi();
  await testFindReturnsNullAndLogsRejections();
  await testCancelProRefundsViaPayments();
  await testCancelAbortsWithoutRefundTarget();
  await testLegacyTopLevelFieldsAloneAreNotEnough();
  console.log("\nAll cancel-pro refund unit tests passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
