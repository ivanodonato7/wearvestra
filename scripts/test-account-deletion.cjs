/**
 * Unit tests for account deletion (soft-delete request + scheduled purge).
 * Usage: node scripts/test-account-deletion.cjs
 */
const assert = require("assert");
const { cancelProForUser } = require("../netlify/functions/lib/cancelPro.cjs");
const { requestAccountDeletion } = require("../netlify/functions/delete-account.cjs");
const { purgeDueAccounts, GRACE_DAYS } = require("../netlify/functions/purge-deleted-accounts.cjs");

function mockAdmin({ profile, updates = [], deletes = [], authOps = [] }) {
  const profiles = {
    select() {
      return this;
    },
    eq() {
      return this;
    },
    not() {
      return this;
    },
    lte() {
      return this;
    },
    order() {
      return this;
    },
    limit() {
      return this;
    },
    async maybeSingle() {
      return { data: profile, error: null };
    },
    async update(payload) {
      updates.push({ table: "profiles", payload });
      return {
        eq() {
          return Promise.resolve({ error: null });
        },
      };
    },
    async delete() {
      deletes.push({ table: "profiles" });
      return {
        eq() {
          return Promise.resolve({ error: null });
        },
      };
    },
  };

  const saved_outfits = {
    delete() {
      deletes.push({ table: "saved_outfits" });
      return {
        eq() {
          return Promise.resolve({ error: null });
        },
      };
    },
  };

  return {
    from(table) {
      if (table === "profiles") return profiles;
      if (table === "saved_outfits") return saved_outfits;
      throw new Error(`unexpected table ${table}`);
    },
    auth: {
      admin: {
        async updateUserById(id, payload) {
          authOps.push({ op: "updateUserById", id, payload });
          return { data: { user: { id } }, error: null };
        },
        async deleteUser(id) {
          authOps.push({ op: "deleteUser", id });
          return { data: { user: { id } }, error: null };
        },
      },
    },
    _updates: updates,
    _deletes: deletes,
    _authOps: authOps,
  };
}

async function testCancelPro() {
  const updates = [];
  const admin = mockAdmin({
    profile: {
      subscription_status: "active",
      stripe_customer_id: "cus_1",
      stripe_subscription_id: "sub_1",
    },
    updates,
  });
  // Fix update chain: cancelPro uses .update().eq()
  admin.from = (table) => {
    if (table !== "profiles") throw new Error(table);
    return {
      select() {
        return this;
      },
      eq() {
        return this;
      },
      async maybeSingle() {
        return {
          data: {
            subscription_status: "active",
            stripe_customer_id: "cus_1",
            stripe_subscription_id: "sub_1",
          },
          error: null,
        };
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
  };

  const stripe = {
    subscriptions: {
      async cancel(id) {
        return { id };
      },
    },
    invoices: {
      async list() {
        return {
          data: [
            {
              id: "in_1",
              status: "paid",
              payments: {
                data: [
                  {
                    id: "inpay_1",
                    status: "paid",
                    created: 1,
                    payment: { type: "payment_intent", payment_intent: "pi_1" },
                  },
                ],
              },
            },
          ],
        };
      },
    },
    refunds: {
      async create() {
        return { id: "re_1", status: "succeeded", amount: 899, currency: "usd" };
      },
    },
  };

  const result = await cancelProForUser({
    stripe,
    admin,
    userId: "user-1",
  });
  assert.strictEqual(result.canceled, true);
  assert.strictEqual(result.refunded, true);
  assert.strictEqual(result.refundId, "re_1");
  assert.ok(updates.some((u) => u.subscription_status === "free"));
  console.log("ok cancelProForUser refunds + frees profile");
}

async function testRequestDeletionCancelsProThenMarks() {
  const updates = [];
  const authOps = [];
  let profile = {
    id: "user-1",
    deletion_requested_at: null,
    subscription_status: "active",
    stripe_customer_id: "cus_1",
    stripe_subscription_id: "sub_1",
  };

  const admin = {
    from(table) {
      if (table !== "profiles") throw new Error(table);
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
          profile = { ...profile, ...payload };
          return {
            eq() {
              return Promise.resolve({ error: null });
            },
          };
        },
      };
    },
    auth: {
      admin: {
        async updateUserById(id, payload) {
          authOps.push({ id, payload });
          return { data: {}, error: null };
        },
      },
    },
  };

  const stripe = {
    subscriptions: {
      async cancel(id) {
        return { id };
      },
    },
    invoices: {
      async list() {
        return {
          data: [
            {
              id: "in_1",
              status: "paid",
              payments: {
                data: [
                  {
                    id: "inpay_1",
                    status: "paid",
                    created: 1,
                    payment: { type: "payment_intent", payment_intent: "pi_1" },
                  },
                ],
              },
            },
          ],
        };
      },
    },
    refunds: {
      async create() {
        return { id: "re_1", status: "succeeded", amount: 899, currency: "usd" };
      },
    },
  };

  const result = await requestAccountDeletion({ stripe, admin, userId: "user-1" });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.alreadyRequested, false);
  assert.ok(result.deletionRequestedAt);
  assert.strictEqual(result.cancel?.canceled, true);
  assert.ok(updates.some((u) => u.deletion_requested_at));
  assert.ok(authOps.some((o) => o.payload?.ban_duration));
  console.log("ok requestAccountDeletion cancels Pro, sets deletion_requested_at, bans user");
}

async function testRequestDeletionIdempotent() {
  const admin = {
    from() {
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        async maybeSingle() {
          return {
            data: {
              id: "user-1",
              deletion_requested_at: "2026-01-01T00:00:00.000Z",
              subscription_status: "free",
            },
            error: null,
          };
        },
      };
    },
  };
  const result = await requestAccountDeletion({ stripe: null, admin, userId: "user-1" });
  assert.strictEqual(result.alreadyRequested, true);
  console.log("ok requestAccountDeletion is idempotent when already requested");
}

async function testPurgeSkipsRecent() {
  const now = new Date("2026-07-22T12:00:00.000Z");
  const recent = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString();
  let queriedCutoff = null;
  const admin = {
    from(table) {
      assert.strictEqual(table, "profiles");
      return {
        select() {
          return this;
        },
        not() {
          return this;
        },
        lte(_col, cutoff) {
          queriedCutoff = cutoff;
          return this;
        },
        order() {
          return this;
        },
        limit() {
          return Promise.resolve({
            data: [], // recent accounts filtered by query
            error: null,
          });
        },
      };
    },
  };
  const summary = await purgeDueAccounts(admin, { now });
  assert.strictEqual(summary.scanned, 0);
  assert.strictEqual(summary.deleted, 0);
  const expectedCutoff = new Date(now.getTime() - GRACE_DAYS * 24 * 60 * 60 * 1000).toISOString();
  assert.strictEqual(queriedCutoff, expectedCutoff);
  assert.ok(recent > queriedCutoff, "10-day-old request is newer than 30-day cutoff");
  console.log("ok purgeDueAccounts uses 30-day cutoff (skips recent)");
}

async function testPurgeDeletesDue() {
  const now = new Date("2026-07-22T12:00:00.000Z");
  const old = new Date(now.getTime() - 31 * 24 * 60 * 60 * 1000).toISOString();
  const deletes = [];
  const authOps = [];
  const admin = {
    from(table) {
      if (table === "profiles") {
        return {
          select() {
            return this;
          },
          not() {
            return this;
          },
          lte() {
            return this;
          },
          order() {
            return this;
          },
          limit() {
            return Promise.resolve({
              data: [{ id: "user-old", deletion_requested_at: old }],
              error: null,
            });
          },
          delete() {
            deletes.push("profiles");
            return {
              eq() {
                return Promise.resolve({ error: null });
              },
            };
          },
        };
      }
      if (table === "saved_outfits") {
        return {
          delete() {
            deletes.push("saved_outfits");
            return {
              eq() {
                return Promise.resolve({ error: null });
              },
            };
          },
        };
      }
      throw new Error(table);
    },
    auth: {
      admin: {
        async deleteUser(id) {
          authOps.push(id);
          return { data: {}, error: null };
        },
      },
    },
  };

  const summary = await purgeDueAccounts(admin, { now });
  assert.strictEqual(summary.scanned, 1);
  assert.strictEqual(summary.deleted, 1);
  assert.deepStrictEqual(deletes, ["saved_outfits", "profiles"]);
  assert.deepStrictEqual(authOps, ["user-old"]);
  console.log("ok purgeDueAccounts deletes outfits + profile + auth user");
}

async function main() {
  assert.strictEqual(GRACE_DAYS, 30);
  await testCancelPro();
  await testRequestDeletionCancelsProThenMarks();
  await testRequestDeletionIdempotent();
  await testPurgeSkipsRecent();
  await testPurgeDeletesDue();
  console.log("\nAll account-deletion tests passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
