# Account deletion (30-day soft delete)

Vestra supports **Delete Account** from Profile when the user is signed in.

## User flow

1. Profile → **Delete Account** (destructive control, separate from “Start over”).
2. Confirmation requires typing **`DELETE`**, then an explicit confirm button.
3. Server (`POST /api/delete-account`):
   - If Pro is active/trialing/past_due → cancel Stripe subscription immediately and refund the latest paid invoice (same logic as Cancel Pro).
   - Sets `profiles.deletion_requested_at = now()` (service role only; clients cannot change this column).
   - Bans the auth user so login is blocked during the grace period.
4. Client signs the user out and clears local session state.
5. If they try to log in again, they see a clear message that deletion is pending and can contact `support@wearvestra.com` within 30 days.

## Database

Run once in Supabase → SQL Editor:

`supabase/account_deletion.sql`

Adds `profiles.deletion_requested_at` and extends the billing protect trigger so only `service_role` can set/clear it.

## Scheduled permanent purge

**Function:** `netlify/functions/purge-deleted-accounts.cjs`  
**Schedule:** daily at **08:00 UTC** (`0 8 * * *` in `netlify.toml`)  
**Grace period:** **30 days** after `deletion_requested_at`

Each run:

1. Finds profiles with `deletion_requested_at <= now() - 30 days` (batch of 50).
2. Deletes `saved_outfits` for that user.
3. Deletes the `profiles` row.
4. Deletes the auth user via `auth.admin.deleteUser` (Supabase Admin API).

Logs a JSON summary to Netlify function logs (`scanned`, `deleted`, `failed`).

This is separate from the daily Awin catalog sync (`product-feed-sync-background` at 07:00 UTC).

## Support restore (within 30 days)

In Supabase (service role / dashboard):

1. Clear `deletion_requested_at` on the profile (`NULL`).
2. Unban the user: Auth → user → unban, or Admin API `ban_duration: 'none'`.

After 30 days the scheduled job will have permanently removed the account.

## Related API

| Endpoint | Purpose |
|----------|---------|
| `POST /api/delete-account` | Soft-delete request (auth required) |
| `POST /api/cancel-subscription` | Cancel Pro + refund only (auth required) |
| Scheduled `purge-deleted-accounts` | Hard-delete after 30 days |
