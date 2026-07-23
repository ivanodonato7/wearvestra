/**
 * Annual prorated refund math + cancelPro annual path (fake subscription).
 * Usage: node scripts/test-annual-prorate-refund.cjs
 *
 * Sanity table for $69.00/year (6900 cents), period = exactly 365 days:
 *   day 30  → remaining 335 → refund cents = round(6900 * 335 / 365)
 *   day 180 → remaining 185 → refund cents = round(6900 * 185 / 365)
 *   day 300 → remaining 65  → refund cents = round(6900 * 65 / 365)
 */
const assert = require("assert");
const {
  computeAnnualProratedRefundCents,
  cancelProForUser,
  SECONDS_PER_DAY,
} = require("../netlify/functions/lib/cancelPro.cjs");

const ANNUAL_CENTS = 6900; // $69.00

function periodForDay(elapsedDays) {
  const start = 1_700_000_000;
  const end = start + 365 * SECONDS_PER_DAY;
  const now = start + elapsedDays * SECONDS_PER_DAY;
  return { start, end, now };
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

function testMathTable() {
  const cases = [
    { day: 30, expectedRemaining: 335 },
    { day: 180, expectedRemaining: 185 },
    { day: 300, expectedRemaining: 65 },
  ];

  console.log("\n=== Annual proration sanity table ($69.00 = 6900 cents) ===");
  console.log("formula: refund_cents = round(6900 * days_remaining / 365)\n");

  for (const { day, expectedRemaining } of cases) {
    const { start, end, now } = periodForDay(day);
    const result = computeAnnualProratedRefundCents({
      originalAmountCents: ANNUAL_CENTS,
      periodStartSec: start,
      periodEndSec: end,
      nowSec: now,
    });
    assert.strictEqual(result.daysElapsed, day, `day ${day} elapsed`);
    assert.strictEqual(result.daysRemaining, expectedRemaining, `day ${day} remaining`);
    const expectedCents = Math.round((ANNUAL_CENTS * expectedRemaining) / 365);
    assert.strictEqual(result.refundCents, expectedCents);
    const usd = (result.refundCents / 100).toFixed(2);
    console.log(
      `Day ${String(day).padStart(3)} | elapsed=${result.daysElapsed} | remaining=${result.daysRemaining} | original=$69.00 | refund=$${usd} (${result.refundCents} cents)`,
    );
  }

  // Day 0 → full year remaining → full refund
  const day0 = computeAnnualProratedRefundCents({
    originalAmountCents: ANNUAL_CENTS,
    ...(() => {
      const { start, end } = periodForDay(0);
      return { periodStartSec: start, periodEndSec: end, nowSec: start };
    })(),
  });
  assert.strictEqual(day0.daysRemaining, 365);
  assert.strictEqual(day0.refundCents, ANNUAL_CENTS);

  // Day 365 → nothing left
  const day365 = computeAnnualProratedRefundCents({
    originalAmountCents: ANNUAL_CENTS,
    ...(() => {
      const { start, end, now } = periodForDay(365);
      return { periodStartSec: start, periodEndSec: end, nowSec: now };
    })(),
  });
  assert.strictEqual(day365.daysRemaining, 0);
  assert.strictEqual(day365.refundCents, 0);

  console.log("ok computeAnnualProratedRefundCents table");
}

async function testAnnualCancelPassesProratedAmount() {
  const { start, end, now } = periodForDay(180);
  const expected = computeAnnualProratedRefundCents({
    originalAmountCents: ANNUAL_CENTS,
    periodStartSec: start,
    periodEndSec: end,
    nowSec: now,
  });

  const updates = [];
  const created = [];
  const admin = profileAdmin(
    {
      subscription_status: "active",
      stripe_customer_id: "cus_1",
      stripe_subscription_id: "sub_annual",
    },
    updates,
  );

  // Freeze "now" inside cancel by stubbing Date only for the proration call path —
  // cancelPro uses Date.now(); override for this test.
  const realNow = Date.now;
  Date.now = () => now * 1000;

  try {
    const stripe = {
      subscriptions: {
        async retrieve(id) {
          return {
            id,
            current_period_start: start,
            current_period_end: end,
            items: { data: [{ price: { recurring: { interval: "year" } } }] },
          };
        },
        async cancel(id) {
          return { id };
        },
      },
      invoices: {
        async list() {
          return {
            data: [
              {
                id: "in_annual",
                status: "paid",
                amount_paid: ANNUAL_CENTS,
                payments: {
                  data: [
                    {
                      id: "inpay_annual",
                      status: "paid",
                      created: start,
                      payment: { type: "payment_intent", payment_intent: "pi_annual" },
                    },
                  ],
                },
              },
            ],
          };
        },
      },
      refunds: {
        async create(params) {
          created.push(params);
          return {
            id: "re_annual",
            status: "succeeded",
            amount: params.amount,
            currency: "usd",
            payment_intent: params.payment_intent,
          };
        },
      },
    };

    const result = await cancelProForUser({ stripe, admin, userId: "user-annual" });
    assert.strictEqual(result.canceled, true);
    assert.strictEqual(result.refunded, true);
    assert.strictEqual(result.billingInterval, "year");
    assert.strictEqual(created[0].amount, expected.refundCents);
    assert.strictEqual(created[0].metadata.refund_policy, "annual_prorated");
    assert.strictEqual(created[0].metadata.days_elapsed, String(expected.daysElapsed));
    assert.strictEqual(created[0].metadata.days_remaining, String(expected.daysRemaining));
    console.log(
      `ok annual cancel at day 180 refunds $${(expected.refundCents / 100).toFixed(2)} (${expected.refundCents} cents)`,
    );
  } finally {
    Date.now = realNow;
  }
}

async function main() {
  testMathTable();
  await testAnnualCancelPassesProratedAmount();
  console.log("\nAll annual prorate refund tests passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
