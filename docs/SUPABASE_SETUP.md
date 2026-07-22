# Create a Supabase project for Vestra (first-time guide)

You do **not** need a credit card for the free tier. About 10 minutes.

## 1. Make an account

1. Open [https://supabase.com](https://supabase.com)
2. Click **Start your project** (or Sign in)
3. Sign up with GitHub or email

## 2. Create a project

1. Click **New project**
2. Pick your organization (or create one)
3. Fill in:
   - **Name:** `vestra` (or anything you like)
   - **Database password:** generate one and **save it somewhere safe** (you rarely need it day-to-day)
   - **Region:** closest to you / your users
4. Click **Create new project** and wait until it says the project is ready (1–2 minutes)

## 3. Turn on email/password auth

1. In the left sidebar: **Authentication** → **Providers**
2. Open **Email**
3. Make sure **Enable Email provider** is ON
4. For easiest testing, turn **Confirm email** OFF (you can turn confirmation on later)
5. Save

## 4. Create the database tables

1. Left sidebar: **SQL Editor** → **New query**
2. Open this file in the Vestra repo: `supabase/schema.sql`
3. Copy **all** of it into the SQL editor
4. Click **Run**
5. You should see success (no red errors)
6. Check **Table Editor** — you should see `profiles` and `saved_outfits`

## 5. Copy the URL and anon key (give these to Cursor / Netlify)

1. Left sidebar: **Project Settings** (gear) → **API**
2. Copy:
   - **Project URL** → looks like `https://abcdefgh.supabase.co`
   - **anon public** key → long JWT starting with `eyJ...`

These two are safe to use in the browser (Row Level Security protects user data).  
Do **not** share the **service_role** key — that one bypasses security.

## 6. Add them as Netlify environment variables

In [Netlify](https://app.netlify.com) → your Vestra site → **Site configuration** → **Environment variables**, add:

| Key | Value |
|-----|--------|
| `VITE_SUPABASE_URL` | Project URL only — `https://….supabase.co` (**no** `/rest/v1` at the end) |
| `VITE_SUPABASE_ANON_KEY` | your anon public key (or `sb_publishable_…`) |

If `VITE_SUPABASE_URL` includes `/rest/v1`, signup fails with **Invalid path specified in request URL**.

Then **trigger a new deploy** (Deploys → Trigger deploy) so the Vite build picks them up.

### Local development (optional)

Create `/workspace/.env.local` (do not commit):

```bash
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

Then `npm run dev`.

## 7. What to send back to Cursor

Paste only:

```
VITE_SUPABASE_URL=https://….supabase.co
VITE_SUPABASE_ANON_KEY=eyJ…
```

Once those are in Netlify (and redeployed), Sign up / Log in on wearvestra.com will talk to your Supabase project. Guests who tap **Skip for testing** keep using this-device localStorage only.

## Billing (optional)

For Vestra Pro ($8.99/mo or $69/yr), also run `supabase/billing.sql` and follow **`docs/STRIPE_SETUP.md`**.

For **Delete Account** (30-day soft delete + scheduled purge), run `supabase/account_deletion.sql` and see **`docs/ACCOUNT_DELETION.md`**.

## How data maps

| App (today) | Supabase |
|-------------|----------|
| `vestra.profile.v1` → `profile.*` | `profiles` row |
| `vestra.profile.v1` → `savedOutfits[]` | `saved_outfits` rows |
| Chat `messages`, hero cache | stay on device for now |
