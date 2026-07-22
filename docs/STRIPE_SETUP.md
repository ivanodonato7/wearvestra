# Vestra Pro — Stripe setup (test mode)

Free tier: **6 live stylist requests / month**.  
Pro: **$8.99/month** or **$69/year** — unlimited stylist + saved outfits.

Use **Test mode** until you explicitly switch to live.

## 1. Supabase SQL

In Supabase → **SQL Editor**, run these files (in order if this is a new project):

1. `supabase/schema.sql` (if needed)
2. `supabase/billing.sql`
3. `supabase/stripe_webhook_events.sql` — webhook event-id idempotency table
4. `supabase/profiles_billing_audit.sql` — append-only audit of billing column changes on `profiles`

`stripe_webhook_events.sql` is required in production so the same Stripe `evt_…` is never applied twice.
`profiles_billing_audit.sql` records every change to `subscription_status` / Stripe IDs (role, uid, old→new) for forensics.



## 2. Stripe Products (you already did / should do)

In Stripe Dashboard (**Test mode ON**):

1. **Product catalog → Products → Add product**
   - Name: `Vestra Pro`
2. Price 1: `8.99` USD, **recurring monthly** → copy Price ID `price_…`
3. On the same product → **Add price**: `69` USD, **recurring yearly** → copy `price_…`

Also enable **Customer portal**:  
Settings → Billing → Customer portal → turn on cancel / update payment (defaults are fine).

## 3. Netlify environment variables

Site configuration → **Environment variables** → add for **all scopes** (or Production + Deploy previews):

| Key | Value |
|-----|--------|
| `STRIPE_SECRET_KEY` | Full `sk_test_…` (not truncated) |
| `STRIPE_PUBLISHABLE_KEY` | Full `pk_test_…` (optional for Checkout redirect; keep for later) |
| `STRIPE_PRICE_MONTHLY` | `price_…` for $8.99/mo |
| `STRIPE_PRICE_YEARLY` | `price_…` for $69/yr |
| `SUPABASE_URL` | Same as `VITE_SUPABASE_URL` — `https://….supabase.co` (**no** `/rest/v1`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → `service_role` (secret!) |

Then **Trigger deploy** (Clear cache and deploy) so functions pick them up.

> This environment cannot log into your Netlify account. Paste the **full** keys yourself — truncated keys ending in `…` will not work.

## 4. Stripe webhook

1. Stripe → **Developers → Webhooks → Add endpoint** (Test mode)
2. Endpoint URL: `https://wearvestra.com/api/stripe-webhook`
3. Events:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
4. Reveal **Signing secret** `whsec_…`
5. Netlify env: `STRIPE_WEBHOOK_SECRET` = that value
6. Redeploy again

## 5. Test cards

Checkout in test mode — use Stripe’s card:

- Number: `4242 4242 4242 4242`
- Any future expiry, any CVC, any ZIP

## 6. App flow

1. Sign in on wearvestra.com  
2. Profile → **Upgrade — $8.99/mo** or **$69/yr** → Stripe Checkout  
3. After pay → back to app; Profile shows **Vestra Pro**  
4. **Manage billing** opens Stripe Customer Portal (cancel / update card)  
5. Free users: 7th live stylist ask in a month shows an upgrade message; Save Outfit is Pro-only

## Going live later

When you say so: create **live** Prices, switch Netlify vars to `sk_live_…` / live price IDs / live webhook secret, and turn Test mode off for the live webhook. Do not mix test and live keys.

The webhook handler **ignores** `livemode: false` events when `STRIPE_SECRET_KEY` starts with `sk_live_` (returns 200 so Stripe stops retrying). Prefer disabling any leftover **test-mode** endpoint that still points at `https://wearvestra.com/api/stripe-webhook`.

