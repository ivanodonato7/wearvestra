/**
 * POST /api/stripe-webhook
 * Stripe subscription lifecycle → profiles.subscription_status (+ customer id)
 *
 * Configure in Stripe Dashboard → Developers → Webhooks:
 *   Endpoint URL: https://wearvestra.com/api/stripe-webhook
 *   Events: checkout.session.completed, customer.subscription.created,
 *           customer.subscription.updated, customer.subscription.deleted
 * Then set STRIPE_WEBHOOK_SECRET in Netlify (must match the endpoint mode).
 *
 * Guards:
 *   - When STRIPE_SECRET_KEY is sk_live_, test-mode events (livemode=false) are ignored
 *   - Each Stripe event id is applied at most once (stripe_webhook_events table)
 */
const Stripe = require("stripe");
const { getServiceClient } = require("./lib/supabaseAdmin.cjs");
const { mapStripeSubscriptionStatus } = require("./lib/billing.cjs");

async function resolveUserId(admin, { userId, customerId, email }) {
  if (userId) {
    const { data } = await admin.from("profiles").select("id").eq("id", userId).maybeSingle();
    if (data?.id) return data.id;
  }
  if (customerId) {
    const { data } = await admin
      .from("profiles")
      .select("id")
      .eq("stripe_customer_id", customerId)
      .maybeSingle();
    if (data?.id) return data.id;
  }
  if (email) {
    const { data: users, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (!error && users?.users) {
      const match = users.users.find((u) => String(u.email || "").toLowerCase() === email.toLowerCase());
      if (match) return match.id;
    }
  }
  return null;
}

async function applySubscription(admin, {
  userId,
  customerId,
  subscriptionId,
  status,
}) {
  if (!userId) return { ok: false, reason: "no_user" };
  const mapped = mapStripeSubscriptionStatus(status);
  const patch = {
    subscription_status: mapped === "canceled" || mapped === "unpaid" || mapped === "incomplete_expired"
      ? (mapped === "canceled" ? "canceled" : "free")
      : mapped,
    updated_at: new Date().toISOString(),
  };
  // Keep canceled as canceled; treat terminal non-pro as free for gating
  if (!["active", "trialing", "past_due", "canceled"].includes(patch.subscription_status)) {
    if (!["active", "trialing"].includes(mapped)) {
      patch.subscription_status = mapped === "past_due" ? "past_due" : "free";
    }
  }
  if (customerId) patch.stripe_customer_id = customerId;
  if (subscriptionId) patch.stripe_subscription_id = subscriptionId;
  if (mapped === "canceled" || mapped === "unpaid" || mapped === "incomplete_expired") {
    patch.subscription_status = mapped === "canceled" ? "canceled" : "free";
    if (mapped === "canceled") patch.stripe_subscription_id = null;
  }

  const { error } = await admin.from("profiles").update(patch).eq("id", userId);
  if (error) throw error;
  return { ok: true, userId, status: patch.subscription_status };
}

/**
 * Claim an event id for processing. Returns true if this invocation owns it.
 * Duplicate deliveries return false (already processed / in flight).
 */
async function claimWebhookEvent(admin, stripeEvent) {
  const { error } = await admin.from("stripe_webhook_events").insert({
    event_id: stripeEvent.id,
    event_type: String(stripeEvent.type || ""),
    livemode: Boolean(stripeEvent.livemode),
  });
  if (!error) return true;
  // Unique violation → already seen
  if (error.code === "23505") return false;
  throw error;
}

async function releaseWebhookEvent(admin, eventId) {
  const { error } = await admin.from("stripe_webhook_events").delete().eq("event_id", eventId);
  if (error) console.error("stripe-webhook release claim failed", eventId, error.message);
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "POST only" };
  }

  const secret = String(process.env.STRIPE_SECRET_KEY || "").trim();
  const whSecret = String(process.env.STRIPE_WEBHOOK_SECRET || "").trim();
  if (!secret || !whSecret) {
    return { statusCode: 503, body: "Stripe webhook not configured" };
  }

  const admin = getServiceClient();
  if (!admin) {
    return { statusCode: 503, body: "Supabase service role not configured" };
  }

  const stripe = new Stripe(secret);
  let payload = event.body || "";
  if (event.isBase64Encoded) {
    payload = Buffer.from(payload, "base64").toString("utf8");
  }
  const sig = event.headers["stripe-signature"] || event.headers["Stripe-Signature"];

  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(payload, sig, whSecret);
  } catch (err) {
    return { statusCode: 400, body: `Webhook signature error: ${err.message}` };
  }

  // Reject test-mode events when running with a live secret key (ack 200 so Stripe stops retrying).
  const usingLiveKey = secret.startsWith("sk_live_");
  if (usingLiveKey && stripeEvent.livemode === false) {
    console.warn("stripe-webhook ignored test event on live key", {
      id: stripeEvent.id,
      type: stripeEvent.type,
    });
    return {
      statusCode: 200,
      body: JSON.stringify({
        received: true,
        ignored: "test_event_on_live_key",
        id: stripeEvent.id,
        type: stripeEvent.type,
      }),
    };
  }

  let claimed = false;
  try {
    claimed = await claimWebhookEvent(admin, stripeEvent);
  } catch (err) {
    console.error("stripe-webhook claim failed", err);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Webhook idempotency store unavailable",
        detail: String(err.message || err).slice(0, 200),
      }),
    };
  }

  if (!claimed) {
    return {
      statusCode: 200,
      body: JSON.stringify({ received: true, duplicate: true, id: stripeEvent.id }),
    };
  }

  try {
    switch (stripeEvent.type) {
      case "checkout.session.completed": {
        const session = stripeEvent.data.object;
        if (session.mode !== "subscription") break;
        const userId = session.client_reference_id
          || session.metadata?.supabase_user_id
          || null;
        const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
        const subscriptionId = typeof session.subscription === "string"
          ? session.subscription
          : session.subscription?.id;
        const email = session.customer_details?.email || session.customer_email || null;
        const resolved = await resolveUserId(admin, { userId, customerId, email });
        let status = "active";
        if (subscriptionId) {
          try {
            const sub = await stripe.subscriptions.retrieve(subscriptionId);
            status = sub.status;
            if (sub.metadata?.supabase_user_id && !resolved) {
              // fallthrough via resolve below
            }
          } catch { /* keep active */ }
        }
        const uid = resolved || await resolveUserId(admin, {
          userId: session.metadata?.supabase_user_id,
          customerId,
          email,
        });
        await applySubscription(admin, {
          userId: uid,
          customerId,
          subscriptionId,
          status,
        });
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = stripeEvent.data.object;
        const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
        const userId = sub.metadata?.supabase_user_id || null;
        const resolved = await resolveUserId(admin, { userId, customerId, email: null });
        const status = stripeEvent.type === "customer.subscription.deleted" ? "canceled" : sub.status;
        await applySubscription(admin, {
          userId: resolved,
          customerId,
          subscriptionId: sub.id,
          status,
        });
        break;
      }
      default:
        break;
    }
  } catch (err) {
    console.error("stripe-webhook handler error", err);
    await releaseWebhookEvent(admin, stripeEvent.id);
    return { statusCode: 500, body: "Handler error" };
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ received: true, id: stripeEvent.id, type: stripeEvent.type }),
  };
};
