/**
 * Supabase browser client.
 * Requires Vite env (also set on Netlify for production builds):
 *   VITE_SUPABASE_URL   → https://YOUR_PROJECT.supabase.co  (no /rest/v1)
 *   VITE_SUPABASE_ANON_KEY
 *
 * Without these, auth/cloud sync is disabled and the app stays on localStorage.
 */
import { createClient } from "@supabase/supabase-js";

/** Strip accidental API paths pasted from the dashboard (e.g. /rest/v1). */
function normalizeSupabaseUrl(raw) {
  let u = String(raw || "").trim().replace(/\/+$/, "");
  if (!u) return "";
  // Common mistake: Project URL copied as the REST endpoint.
  u = u.replace(/\/rest\/v1$/i, "");
  u = u.replace(/\/auth\/v1$/i, "");
  u = u.replace(/\/+$/, "");
  return u;
}

const url = normalizeSupabaseUrl(import.meta.env?.VITE_SUPABASE_URL);
const anonKey = String(import.meta.env?.VITE_SUPABASE_ANON_KEY || "").trim();

export const supabaseConfigured = Boolean(url && anonKey);

export const supabase = supabaseConfigured
  ? createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  })
  : null;
