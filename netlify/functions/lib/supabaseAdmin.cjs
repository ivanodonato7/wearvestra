/**
 * Server-side Supabase admin client (service role).
 * Netlify env: SUPABASE_URL (or VITE_SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY
 */
const { createClient } = require("@supabase/supabase-js");

function supabaseUrl() {
  return String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "")
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/rest\/v1$/i, "");
}

function getServiceClient() {
  const url = supabaseUrl();
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function userFromAuthHeader(event) {
  const headers = event.headers || {};
  const raw = headers.authorization || headers.Authorization || "";
  const m = String(raw).match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const admin = getServiceClient();
  if (!admin) return null;
  const { data, error } = await admin.auth.getUser(m[1].trim());
  if (error || !data?.user) return null;
  return data.user;
}

module.exports = { getServiceClient, userFromAuthHeader, supabaseUrl };
