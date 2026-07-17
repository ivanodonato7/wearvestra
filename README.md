# Vestra — AI Stylist

Installable fashion stylist app for **[wearvestra.com](https://wearvestra.com)**.

Source prototype: [Claude artifact](https://claude.ai/public/artifacts/435fc56d-b0e0-44f9-9294-6b9dbfa3af98).

## Features

- Multilingual onboarding (EN / ES / FR)
- Style DNA profiling
- Mock AI stylist chat with outfit recommendations
- Wardrobe + bag by retailer
- Progressive Web App (install to home screen)
- Capacitor Android shell (`com.wearvestra.app`)

## Develop

```bash
npm install
npm run dev
```

## Production build

```bash
npm run build
npm run preview
```

## Publish to wearvestra.com

See [DEPLOY.md](./DEPLOY.md). Domain is on Porkbun — point DNS at Vercel, Netlify, or Porkbun Static Hosting after deploying `dist/`.

## Native app

```bash
npm run cap:android   # Android Studio
```
