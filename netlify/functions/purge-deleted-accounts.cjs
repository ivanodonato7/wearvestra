/**
 * purge-deleted-accounts — scheduled daily job
 *
 * Permanently deletes accounts whose profiles.deletion_requested_at is older
 * than 30 days:
 *   - saved_outfits rows for the user
 *   - profiles row
 *   - auth user via Supabase Admin API (cascades remaining refs)
 *
 * Schedule: every day at 08:00 UTC (see netlify.toml).
 * Docs: docs/ACCOUNT_DELETION.md
 */
const { getServiceClient } = require("./lib/supabaseAdmin.cjs");

const GRACE_DAYS = 30;
const BATCH_LIMIT = 50;

async function purgeDueAccounts(admin, { now = new Date(), limit = BATCH_LIMIT } = {}) {
  const cutoff = new Date(now.getTime() - GRACE_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: rows, error } = await admin
    .from("profiles")
    .select("id, deletion_requested_at")
    .not("deletion_requested_at", "is", null)
    .lte("deletion_requested_at", cutoff)
    .order("deletion_requested_at", { ascending: true })
    .limit(limit);

  if (error) throw error;

  const results = [];
  for (const row of rows || []) {
    const userId = row.id;
    const entry = {
      userIdPrefix: String(userId).slice(0, 8),
      deletionRequestedAt: row.deletion_requested_at,
      ok: false,
    };
    try {
      const { error: outfitsErr } = await admin
        .from("saved_outfits")
        .delete()
        .eq("user_id", userId);
      if (outfitsErr) throw outfitsErr;

      const { error: profileErr } = await admin
        .from("profiles")
        .delete()
        .eq("id", userId);
      if (profileErr) throw profileErr;

      const { error: authErr } = await admin.auth.admin.deleteUser(userId);
      if (authErr) throw authErr;

      entry.ok = true;
    } catch (err) {
      entry.ok = false;
      entry.error = String(err.message || err).slice(0, 300);
      console.error("purge-deleted-accounts item failed", entry);
    }
    results.push(entry);
  }

  return {
    cutoff,
    scanned: (rows || []).length,
    deleted: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  };
}

exports.purgeDueAccounts = purgeDueAccounts;
exports.GRACE_DAYS = GRACE_DAYS;

exports.handler = async () => {
  const admin = getServiceClient();
  if (!admin) {
    return {
      statusCode: 503,
      body: JSON.stringify({ error: "Supabase service role not configured" }),
    };
  }

  try {
    const summary = await purgeDueAccounts(admin);
    console.log("purge-deleted-accounts", JSON.stringify(summary));
    return { statusCode: 200, body: JSON.stringify(summary) };
  } catch (err) {
    console.error("purge-deleted-accounts error", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: String(err.message || err).slice(0, 300) }),
    };
  }
};
