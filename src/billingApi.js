/**
 * Client helpers for Vestra Pro billing (Stripe Checkout + Customer Portal).
 */
import { supabase, supabaseConfigured } from "./supabaseClient.js";

export const FREE_STYLIST_LIMIT = 6;

async function accessToken() {
  if (!supabaseConfigured || !supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token || null;
}

async function authFetch(path, { method = "GET", body } = {}) {
  const token = await accessToken();
  if (!token) {
    const err = new Error("Sign in required");
    err.code = "auth_required";
    throw err;
  }
  const res = await fetch(path, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.code = data.code || String(res.status);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export async function fetchBillingStatus() {
  return authFetch("/api/billing-status", { method: "GET" });
}

/** @param {"monthly"|"yearly"} price */
export async function startCheckout(price = "monthly") {
  const data = await authFetch("/api/stripe-checkout", {
    method: "POST",
    body: { price },
  });
  if (!data?.url) throw new Error("No checkout URL");
  window.location.assign(data.url);
  return data;
}

export async function openCustomerPortal() {
  const data = await authFetch("/api/stripe-portal", { method: "POST", body: {} });
  if (!data?.url) throw new Error("No portal URL");
  window.location.assign(data.url);
  return data;
}

/** Immediately cancel Pro + refund latest charge. */
export async function cancelProSubscription() {
  return authFetch("/api/cancel-subscription", { method: "POST", body: {} });
}

/** Soft-delete account (30-day grace). Cancels Pro first if needed. */
export async function requestAccountDeletion() {
  return authFetch("/api/delete-account", { method: "POST", body: {} });
}

export function isProBilling(statusOrFlag) {
  if (statusOrFlag === true) return true;
  if (statusOrFlag && typeof statusOrFlag === "object") {
    if (statusOrFlag.pro === true) return true;
    statusOrFlag = statusOrFlag.status;
  }
  const s = String(statusOrFlag || "").toLowerCase();
  return s === "active" || s === "trialing";
}

export async function getAccessToken() {
  return accessToken();
}
