# Vestra — AI Stylist

Installable fashion stylist app for **[wearvestra.com](https://wearvestra.com)**.

**GitHub:** https://github.com/ivanodonato7/wearvestra

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

Site is deployed via GitHub Pages (`gh-pages` branch). Point Porkbun DNS at GitHub — see [DEPLOY.md](./DEPLOY.md).

## Native app

```bash
npm run cap:android   # Android Studio
```
