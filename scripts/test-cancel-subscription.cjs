/**
 * End-to-end mocked test for cancel-subscription (no live Stripe / Supabase).
 * Run: node scripts/test-cancel-subscription.cjs
 */
const assert = require("assert");
const { cancelProForUser } = require("../netlify/functions/cancel-subscription.cjs");

function mockAdmin(initialProfile) {
  let profile = { ...initialProfile };
  const updates = [];
  return {
    get profile() { return profile; },
    get updates() { return updates; },
    from(table) {
      assert.strictEqual(table, "profiles");
      return {
        select() {
          return {
            eq(col, id) {
              assert.strictEqual(col, "id");
              return {
                async maybeSingle() {
                  if (profile.id !== id) return { data: null, error: null };
                  return { data: { ...profile }, error: null };
                },
              };
            },
          };
        },
        update(patch) {
          return {
            async eq(col, id) {
              assert.strictEqual(col, "id");
              assert.strictEqual(id, profile.id);
              updates.push({ ...patch });
              profile = { ...profile, ...patch };
              return { error: null };
            },
          };
        },
      };
    },
  };
}

function mockStripe({ cancelImpl, refundImpl, invoices, subscriptionsList }) {
  const calls = { cancel: [], refunds: [], invoices: 0, list: 0 };
  return {
    calls,
    subscriptions: {
      async cancel(id) {
        calls.cancel.push(id);
        if (cancelImpl) return cancelImpl(id);
        return { id, status: "canceled" };
      },
      async list(params) {
        calls.list += 1;
        return { data: subscriptionsList ? subscriptionsList(params) : [] };
      },
    },
    invoices: {
      async list(params) {
        calls.invoices += 1;
        return { data: invoices ? invoices(params) : [] };
      },
    },
    refunds: {
      async create(params) {
        calls.refunds.push(params);
        if (refundImpl) return refundImpl(params);
        return { id: "re_test_1", status: "succeeded" };
      },
    },
  };
}

async function testHappyPath() {
  const userId = "6c88e3e3-ea6a-407f-9be7-a5303d45ce8a";
  const admin = mockAdmin({
    id: userId,
    subscription_status: "active",
    stripe_customer_id: "cus_live_keep_me",
    stripe_subscription_id: "sub_live_abc",
  });
  const stripe = mockStripe({
    invoices: () => [{
      id: "in_1",
      payment_intent: "pi_1",
      charge: "ch_1",
    }],
  });

  const result = await cancelProForUser({ stripe, admin, userId });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.subscriptionId, "sub_live_abc");
  assert.strictEqual(result.refundId, "re_test_1");
  assert.strictEqual(result.refunded, true);
  assert.strictEqual(result.customerIdKept, true);
  assert.deepStrictEqual(stripe.calls.cancel, ["sub_live_abc"]);
  assert.strictEqual(stripe.calls.refunds.length, 1);
  assert.strictEqual(stripe.calls.refunds[0].payment_intent, "pi_1");
  assert.strictEqual(admin.profile.subscription_status, "free");
  assert.strictEqual(admin.profile.stripe_subscription_id, null);
  assert.strictEqual(admin.profile.stripe_customer_id, "cus_live_keep_me");
  console.log("✓ happy path: cancel + refund + profile free (customer kept)");
}

async function testAuthScopeOnlyOwnProfile() {
  const admin = mockAdmin({
    id: "user-a",
    subscription_status: "active",
    stripe_customer_id: "cus_a",
    stripe_subscription_id: "sub_a",
  });
  const stripe = mockStripe({
    invoices: () => [{ id: "in_a", payment_intent: "pi_a" }],
  });
  // Asking for a different user id → profile missing (eq filters by userId)
  await assert.rejects(
    () => cancelProForUser({ stripe, admin, userId: "user-b" }),
    (err) => err.code === "profile_missing"
  );
  assert.strictEqual(stripe.calls.cancel.length, 0);
  console.log("✓ cannot cancel another user's subscription (profile scoped by auth user id)");
}

async function testRejectsNonActive() {
  const userId = "user-free";
  const admin = mockAdmin({
    id: userId,
    subscription_status: "free",
    stripe_customer_id: "cus_x",
    stripe_subscription_id: null,
  });
  const stripe = mockStripe({});
  await assert.rejects(
    () => cancelProForUser({ stripe, admin, userId }),
    (err) => err.code === "not_pro"
  );
  assert.strictEqual(stripe.calls.cancel.length, 0);
  console.log("✓ rejects cancel when not Pro");
}

async function testResolvesSubFromCustomer() {
  const userId = "user-c";
  const admin = mockAdmin({
    id: userId,
    subscription_status: "active",
    stripe_customer_id: "cus_c",
    stripe_subscription_id: null,
  });
  const stripe = mockStripe({
    subscriptionsList: () => [{ id: "sub_from_list", status: "active" }],
    invoices: () => [{ id: "in_c", charge: "ch_c" }],
  });
  const result = await cancelProForUser({ stripe, admin, userId });
  assert.strictEqual(result.subscriptionId, "sub_from_list");
  assert.strictEqual(stripe.calls.refunds[0].charge, "ch_c");
  assert.strictEqual(admin.profile.stripe_customer_id, "cus_c");
  console.log("✓ resolves subscription from customer when profile sub id missing");
}

async function testCancelWithoutRefundableInvoice() {
  const userId = "user-d";
  const admin = mockAdmin({
    id: userId,
    subscription_status: "active",
    stripe_customer_id: "cus_d",
    stripe_subscription_id: "sub_d",
  });
  const stripe = mockStripe({ invoices: () => [] });
  const result = await cancelProForUser({ stripe, admin, userId });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.refunded, false);
  assert.strictEqual(admin.profile.subscription_status, "free");
  console.log("✓ cancels even when no paid invoice to refund");
}

async function main() {
  await testHappyPath();
  await testAuthScopeOnlyOwnProfile();
  await testRejectsNonActive();
  await testResolvesSubFromCustomer();
  await testCancelWithoutRefundableInvoice();
  console.log("\nAll cancel-subscription tests passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
