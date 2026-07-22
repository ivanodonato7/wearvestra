/**
 * Cloud profile + saved outfits (Supabase).
 * Maps to/from the app's in-memory profile shape (same as vestra.profile.v1).
 */
import { supabase, supabaseConfigured } from "./supabaseClient.js";

export function rowToProfile(row) {
  if (!row) return null;
  return {
    name: row.name || "",
    archetype: row.archetype ?? null,
    fit: row.fit ?? null,
    lifestyle: row.lifestyle ?? null,
    palette: Array.isArray(row.palette) ? row.palette : [],
    avoid: Array.isArray(row.avoid) ? row.avoid : [],
    budget: row.budget ?? null,
    occasions: Array.isArray(row.occasions) ? row.occasions : [],
    favoriteStores: Array.isArray(row.favorite_stores) ? row.favorite_stores : [],
  };
}

export function profileToRow(profile, { lang = "en", answers = {} } = {}) {
  return {
    name: profile?.name || "",
    archetype: profile?.archetype ?? null,
    fit: profile?.fit ?? null,
    lifestyle: profile?.lifestyle ?? null,
    palette: profile?.palette || [],
    avoid: profile?.avoid || [],
    budget: profile?.budget ?? null,
    occasions: profile?.occasions || [],
    favorite_stores: profile?.favoriteStores || [],
    answers: answers || {},
    lang: lang || "en",
  };
}

export async function getSessionUser() {
  if (!supabaseConfigured || !supabase) return null;
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) return null;
  // Soft-deleted accounts should not keep an active session
  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("deletion_requested_at")
      .eq("id", data.user.id)
      .maybeSingle();
    if (profile?.deletion_requested_at) {
      await supabase.auth.signOut();
      return null;
    }
  } catch {
    /* ignore — billing column may not exist until migration runs */
  }
  return data.user;
}

export async function signUpWithEmail({ email, password, name, emailRedirectTo }) {
  if (!supabase) throw new Error("Supabase is not configured");
  const { data, error } = await supabase.auth.signUp({
    email: String(email || "").trim().toLowerCase(),
    password: String(password || ""),
    options: {
      data: { name: String(name || "").trim() },
      emailRedirectTo: emailRedirectTo || undefined,
    },
  });
  if (error) throw error;
  return data;
}

export async function signInWithEmail({ email, password }) {
  if (!supabase) throw new Error("Supabase is not configured");
  const { data, error } = await supabase.auth.signInWithPassword({
    email: String(email || "").trim().toLowerCase(),
    password: String(password || ""),
  });
  if (error) {
    const msg = String(error.message || "").toLowerCase();
    if (msg.includes("banned") || msg.includes("disabled") || error.status === 403) {
      const err = new Error(
        "This account is scheduled for deletion. Contact support@wearvestra.com within 30 days if you want to keep it."
      );
      err.code = "account_deletion_pending";
      throw err;
    }
    throw error;
  }
  // Belt-and-suspenders: profile soft-delete flag
  const userId = data?.user?.id;
  if (userId) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("deletion_requested_at")
      .eq("id", userId)
      .maybeSingle();
    if (profile?.deletion_requested_at) {
      await supabase.auth.signOut();
      const err = new Error(
        "This account is scheduled for deletion. Contact support@wearvestra.com within 30 days if you want to keep it."
      );
      err.code = "account_deletion_pending";
      throw err;
    }
  }
  return data;
}

export async function signOut() {
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function fetchCloudProfile(userId) {
  if (!supabase || !userId) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function upsertCloudProfile(userId, profile, extras = {}) {
  if (!supabase || !userId) return null;
  const row = {
    id: userId,
    ...profileToRow(profile, extras),
  };
  const { data, error } = await supabase
    .from("profiles")
    .upsert(row, { onConflict: "id" })
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function fetchCloudSavedOutfits(userId) {
  if (!supabase || !userId) return [];
  const { data, error } = await supabase
    .from("saved_outfits")
    .select("id, outfit, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data || []).map((row) => ({
    ...(row.outfit || {}),
    id: row.outfit?.id || row.id,
    _cloudId: row.id,
  }));
}

/** Replace cloud saved outfits with the current list (keeps last 40). */
export async function syncCloudSavedOutfits(userId, outfits = []) {
  if (!supabase || !userId) return;
  const slim = (outfits || []).slice(-40);
  const { error: delErr } = await supabase
    .from("saved_outfits")
    .delete()
    .eq("user_id", userId);
  if (delErr) throw delErr;
  if (!slim.length) return;
  const rows = slim.map((outfit) => ({
    user_id: userId,
    outfit,
  }));
  const { error } = await supabase.from("saved_outfits").insert(rows);
  if (error) throw error;
}

export async function appendCloudSavedOutfit(userId, outfit) {
  if (!supabase || !userId || !outfit) return null;
  const { data, error } = await supabase
    .from("saved_outfits")
    .insert({ user_id: userId, outfit })
    .select("id, outfit")
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** True if local blob has something worth importing into a new account. */
export function localHasImportableData(stored) {
  if (!stored) return false;
  const p = stored.profile || {};
  const hasDna = Boolean(
    (p.name && p.name.trim() && p.name !== "Alex")
    || p.archetype
    || (p.palette && p.palette.length)
    || (p.occasions && p.occasions.length)
    || (p.favoriteStores && p.favoriteStores.length),
  );
  const hasOutfits = Array.isArray(stored.savedOutfits) && stored.savedOutfits.length > 0;
  // Skip-for-testing DEFAULT_PROFILE alone shouldn't force an import prompt
  const isDefaultSkip = p.name === "Alex" && p.archetype === "Quiet Tailored" && !hasOutfits;
  if (isDefaultSkip) return false;
  return hasDna || hasOutfits;
}
