# Deploy Vestra to wearvestra.com

Your domain is registered at **Porkbun** and currently shows the default parking page. Publishing needs two things: host the built site, then point DNS at that host.

## Option A — Vercel (recommended, free)

1. Push this project to a GitHub repo (or import the folder at [vercel.com/new](https://vercel.com/new)).
2. In Vercel → Project → Settings → Domains, add:
   - `wearvestra.com`
   - `www.wearvestra.com`
3. In Porkbun → Domain Management → wearvestra.com → DNS Records:
   - Remove the parking / link A records that point at Porkbun’s placeholder.
   - Add the records Vercel shows (usually an **A** for `@` → `76.76.21.21` and a **CNAME** for `www` → `cname.vercel-dns.com`).
4. Wait a few minutes for DNS. Visit https://wearvestra.com

CLI (if you have a Vercel account logged in):

```bash
npx vercel --prod
npx vercel domains add wearvestra.com
```

## Option B — Porkbun Static Hosting

1. In Porkbun, open the house icon next to wearvestra.com → **Static Hosting** (15-day trial available).
2. Upload everything inside the local `dist/` folder after `npm run build` (or connect GitHub).
3. Make sure `index.html` is at the site root.

## Option C — Netlify

Same idea as Vercel: connect the repo, add `wearvestra.com`, then set the DNS records Netlify provides in Porkbun.

---

## Installable app (PWA)

Once the site is live on HTTPS:

- **iPhone**: Safari → Share → Add to Home Screen
- **Android**: Chrome → menu → Install app / Add to Home screen

That installs Vestra as a standalone app (no App Store required).

## Native Android app (Capacitor)

```bash
npm run cap:android
```

Opens Android Studio with the `android/` project (`com.wearvestra.app`). Build an APK/AAB from there for Play Store or sideload.

iOS requires a Mac + Xcode:

```bash
npx cap add ios
npx cap sync
npx cap open ios
```
