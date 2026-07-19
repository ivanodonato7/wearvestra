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
      includeAssets: ['favicon.svg', 'icons/*.png', 'icons/*.svg', 'version.json'],
      manifest: {
        name: 'Vestra',
        short_name: 'Vestra',
        description: 'Your AI stylist — streetwear to classy to sexy — outfits, wardrobe, and shopping.',
        theme_color: '#F6F1E7',
        background_color: '#F6F1E7',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        lang: 'en',
        categories: ['lifestyle', 'shopping', 'fashion'],
        icons: [
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
        ],
      },
    }),
  ],
})
