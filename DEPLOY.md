# Deploy Vestra to wearvestra.com

## Live on GitHub Pages (current)

- **Repo:** https://github.com/ivanodonato7/wearvestra
- **Pages branch:** `gh-pages` (built site)
- **Domain:** https://wearvestra.com

### Redeploy static site

```bash
npm run build
# publish dist/ to the gh-pages branch
```

```bash
npm run scan:stock   # refresh in-stock retailer listings (Bing Shopping)
```

---

## Live Claude stylist on Netlify (recommended)

GitHub Pages cannot keep an API key secret. Netlify runs the stylist function server-side.

### One-time setup (~5 minutes)

1. Create a free site at [app.netlify.com](https://app.netlify.com) → **Add new site** → **Import** the `wearvestra` repo (or create empty and link later).
2. Copy the **Site ID** (Site configuration → Site details).
3. Create a [Netlify personal access token](https://app.netlify.com/user/applications#personal-access-tokens).
4. Create an [Anthropic API key](https://console.anthropic.com/).
5. In GitHub → **Settings → Secrets and variables → Actions**, add:
   - `NETLIFY_AUTH_TOKEN`
   - `NETLIFY_SITE_ID`
   - `ANTHROPIC_API_KEY`
6. Copy `deploy/github-action-deploy-netlify.yml` → `.github/workflows/deploy-netlify.yml`, commit, then run **Actions → Deploy Netlify (live stylist) → Run workflow**.

Or locally after `npx netlify-cli login` and `npx netlify-cli link`:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
npm run netlify:env
npm run deploy:netlify
```

Point `wearvestra.com` DNS at Netlify (or keep Pages for static and use a Netlify subdomain like `app.wearvestra.com` for the live stylist). The app calls `/api/stylist` first.

Without the key, Vestra still works with the on-device composer (profile + palette aware).

### Serper hybrid web search (optional)

When `SERPER_API_KEY` is set, the live stylist backfills **thin** Awin families (especially belt/shoe) via Google Shopping, then prefers Awin matches when both fit. Idle days cost $0 (pay-as-you-go credits). Without the key, behavior is unchanged (Awin-only).

```bash
export SERPER_API_KEY=...          # from https://serper.dev
export SKIMLINKS_SITE_ID=...       # optional — wraps non-Awin product URLs
bash scripts/netlify-set-serper.sh
npm run deploy:netlify
```

Optional `SKIMLINKS_SITE_ID` monetizes Serper merchant links after Skimlinks publisher approval. Awin deep links are never rewritten.

### AI outfit heroes (FASHN)

1. Create an API key at [FASHN.ai](https://fashn.ai) / [docs.fashn.ai](https://docs.fashn.ai).
2. In Netlify → **Environment variables**, add `FASHN_API_KEY`.
3. Redeploy. Stylist looks call `/api/generate-hero` and cache results in the browser.

Without the key, looks still show the catalog collage + item list (no blocking error).

---

### Supabase accounts (Style DNA sync)

1. Follow **`docs/SUPABASE_SETUP.md`** to create the project and run `supabase/schema.sql`.
2. In Netlify → Environment variables, add:
   - `VITE_SUPABASE_URL` = `https://YOUR_PROJECT.supabase.co` (no `/rest/v1`)
   - `VITE_SUPABASE_ANON_KEY` = anon / publishable key
3. Redeploy. Guests / “Skip for testing” still use `localStorage` only.

## Stripe (Vestra Pro)

Follow **`docs/STRIPE_SETUP.md`**. Required Netlify secrets (test mode first):

- `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`
- `STRIPE_PRICE_MONTHLY`, `STRIPE_PRICE_YEARLY`
- `STRIPE_WEBHOOK_SECRET`
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`

Without these vars, the app behaves as before (device-only Style DNA).

---

## Install as an app

- iPhone: Safari → Share → **Add to Home Screen**
- Android: Chrome → **Install app**

## Native Android

```bash
npm run cap:android
```
