/**
 * Handler-level auth + CORS smoke for cancel-subscription (mocked deps).
 * Run: node scripts/test-cancel-subscription-handler.cjs
 */
const assert = require("assert");
const Module = require("module");
const path = require("path");

const fnPath = path.resolve(__dirname, "../netlify/functions/cancel-subscription.cjs");

// Stub supabaseAdmin + billing before loading the function
const stubs = {
  "./lib/supabaseAdmin.cjs": {
    userFromAuthHeader: async () => null,
    getServiceClient: () => null,
  },
  "./lib/billing.cjs": {
    corsHeaders: () => ({ "Content-Type": "application/json" }),
  },
};

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (stubs[request]) return stubs[request];
  return originalLoad(request, parent, isMain);
};

delete require.cache[require.resolve(fnPath)];
const { handler } = require(fnPath);

async function main() {
  process.env.STRIPE_SECRET_KEY = "sk_test_cancel_handler_smoke";

  // Unauthenticated → 401 (service client null is ok; auth runs first after secret check)
  stubs["./lib/supabaseAdmin.cjs"].userFromAuthHeader = async () => null;
  stubs["./lib/supabaseAdmin.cjs"].getServiceClient = () => ({});

  delete require.cache[require.resolve(fnPath)];
  const { handler } = require(fnPath);

  const unauth = await handler({ httpMethod: "POST", headers: {}, body: "{}" });
  assert.strictEqual(unauth.statusCode, 401);
  const body = JSON.parse(unauth.body);
  assert.strictEqual(body.error, "Sign in required");
  console.log("✓ handler rejects unauthenticated cancel");

  const badMethod = await handler({ httpMethod: "GET", headers: {}, body: "" });
  assert.strictEqual(badMethod.statusCode, 405);
  console.log("✓ handler rejects non-POST");

  console.log("\nHandler auth smoke tests passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
}).finally(() => {
  Module._load = originalLoad;
});
