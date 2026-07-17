# Deploy Vestra to wearvestra.com

## Live on GitHub

- **Repo:** https://github.com/ivanodonato7/wearvestra
- **Pages branch:** `gh-pages` (built site)
- **GitHub Pages:** custom domain set to `wearvestra.com`

## Point DNS (Porkbun) — required

The domain still shows Porkbun’s parking page until DNS points at GitHub Pages.

1. Log in to [Porkbun](https://porkbun.com) → Domain Management → **wearvestra.com** → **DNS Records**
2. Delete existing parking / link **A** (and ALIAS/CNAME) records for `@` and `www`
3. Add:

| Type | Host | Answer |
|------|------|--------|
| A | *(blank)* | `185.199.108.153` |
| A | *(blank)* | `185.199.109.153` |
| A | *(blank)* | `185.199.110.153` |
| A | *(blank)* | `185.199.111.153` |
| CNAME | `www` | `ivanodonato7.github.io` |

4. Wait a few minutes, then open https://wearvestra.com
5. In GitHub → Settings → Pages, click **Check again** if needed, then enable **Enforce HTTPS**

## Redeploy after code changes

```bash
npm run build
# Publish the contents of dist/ to the gh-pages branch
```

## Live Claude stylist (optional)

On **Netlify**, set `ANTHROPIC_API_KEY` and deploy — the app calls `/.netlify/functions/stylist`.
Without the key (e.g. GitHub Pages), Vestra uses the on-device composer, still driven by the user’s profile and palette.

## Install as an app

Once HTTPS works on wearvestra.com:

- iPhone: Safari → Share → **Add to Home Screen**
- Android: Chrome → **Install app**

## Native Android

```bash
npm run cap:android
```
