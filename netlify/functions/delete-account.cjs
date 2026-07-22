/**
 * POST /api/delete-account
 * Auth: Bearer Supabase access token
 *
 * Soft-deletes the signed-in user's account:
 *  1. Cancel Pro + refund if subscribed (shared cancelPro helper)
 *  2. Set profiles.deletion_requested_at = now()
 *  3. Ban the auth user so they cannot log back in during the 30-day grace period
 *
 * Permanent purge runs via purge-deleted-accounts (scheduled).
 */
const Stripe = require("stripe");
const { getServiceClient, userFromAuthHeader } = require("./lib/supabaseAdmin.cjs");
const { corsHeaders } = require("./lib/billing.cjs");
const { cancelProForUser } = require("./lib/cancelPro.cjs");

const DELETION_BAN = "876000h"; // ~100 years — support can unban; purge deletes the user

async function requestAccountDeletion({ stripe, admin, userId }) {
  const { data: profile, error } = await admin
    .from("profiles")
    .select("id, deletion_requested_at, subscription_status")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!profile) {
    const err = new Error("Profile not found");
    err.code = "profile_missing";
    throw err;
  }

  if (profile.deletion_requested_at) {
    return {
      ok: true,
      alreadyRequested: true,
      deletionRequestedAt: profile.deletion_requested_at,
      cancel: null,
    };
  }

  const status = String(profile.subscription_status || "").toLowerCase();
  const isProish = ["active", "trialing", "past_due"].includes(status);

  let cancel = null;
  if (isProish) {
    if (!stripe) {
      const err = new Error("Stripe not configured — cannot cancel Pro before deleting");
      err.code = "stripe_required";
      throw err;
    }
    try {
      cancel = await cancelProForUser({
        stripe,
        admin,
        userId,
        allowNotPro: false,
      });
    } catch (err) {
      if (err.code === "refund_failed") {
        cancel = {
          canceled: true,
          subscriptionId: err.subscriptionId || null,
          refundId: null,
          refunded: false,
          refundError: String(err.message || err).slice(0, 200),
        };
      } else if (err.code === "no_subscription" || err.code === "not_pro") {
        // Local Pro flag without Stripe sub — clear local status and continue
        await admin
          .from("profiles")
          .update({
            subscription_status: "free",
            stripe_subscription_id: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", userId);
        cancel = { canceled: false, subscriptionId: null, refundId: null, refunded: false };
      } else {
        throw err;
      }
    }
  }

  const deletionRequestedAt = new Date().toISOString();
  const { error: upErr } = await admin
    .from("profiles")
    .update({
      deletion_requested_at: deletionRequestedAt,
      updated_at: deletionRequestedAt,
    })
    .eq("id", userId);
  if (upErr) throw upErr;

  try {
    await admin.auth.admin.updateUserById(userId, { ban_duration: DELETION_BAN });
  } catch (err) {
    console.error("delete-account ban failed", err.message);
  }

  return {
    ok: true,
    alreadyRequested: false,
    deletionRequestedAt,
    cancel,
  };
}

exports.requestAccountDeletion = requestAccountDeletion;

exports.handler = async (event) => {
  const headers = corsHeaders();
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers, body: "" };
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "POST only" }) };
  }

  const user = await userFromAuthHeader(event);
  if (!user) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: "Sign in required" }) };
  }

  const admin = getServiceClient();
  if (!admin) {
    return {
      statusCode: 503,
      headers,
      body: JSON.stringify({ error: "Supabase service role not configured" }),
    };
  }

  const secret = String(process.env.STRIPE_SECRET_KEY || "").trim();
  const stripe = secret ? new Stripe(secret) : null;

  try {
    const result = await requestAccountDeletion({ stripe, admin, userId: user.id });
    return { statusCode: 200, headers, body: JSON.stringify(result) };
  } catch (err) {
    const code = err.code || "delete_failed";
    const status = code === "stripe_required" || code === "profile_missing" ? 503 : 502;
    console.error("delete-account error", {
      code,
      message: String(err.message || err).slice(0, 400),
      userIdPrefix: String(user.id || "").slice(0, 8),
    });
    return {
      statusCode: status,
      headers,
      body: JSON.stringify({
        error: String(err.message || "Delete account failed").slice(0, 300),
        code,
      }),
    };
  }
};
