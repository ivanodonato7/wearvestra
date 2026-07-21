/**
 * Supabase browser client.
 * Requires Vite env (also set on Netlify for production builds):
 *   VITE_SUPABASE_URL
 *   VITE_SUPABASE_ANON_KEY
 *
 * Without these, auth/cloud sync is disabled and the app stays on localStorage.
 */
import { createClient } from "@supabase/supabase-js";

const url = String(import.meta.env?.VITE_SUPABASE_URL || "").trim();
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
