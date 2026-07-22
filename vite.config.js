import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // Destroy existing service workers on visit — stale navigateFallback shells
      // were leaving first-time (and returning) users on a dead landing page.
      selfDestroying: true,
      injectRegister: null,
      includeAssets: ['favicon.ico', 'favicon.svg', 'icons/*.png', 'icons/*.svg', 'version.json'],
      manifest: {
        name: 'Vestra',
        short_name: 'Vestra',
        description: "Vestra is an AI-powered personal stylist for men — describe an occasion and get complete, coordinated outfit recommendations with direct links to buy each piece from top retailers.",
        theme_color: '#0B0B0C',
        background_color: '#0B0B0C',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        lang: 'en',
        categories: ['lifestyle', 'shopping', 'fashion'],
        icons: [
          {
            src: '/icons/favicon-32x32.png',
            sizes: '32x32',
            type: 'image/png',
          },
          {
            src: '/icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: '/icons/apple-touch-icon.png',
            sizes: '180x180',
            type: 'image/png',
          },
        ],
      },
    }),
  ],
})
