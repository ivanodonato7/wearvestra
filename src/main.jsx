import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './vestra.css'
import App from './App.jsx'

async function bootNativeShell() {
  try {
    const { Capacitor } = await import('@capacitor/core')
    if (!Capacitor.isNativePlatform()) return
    const { StatusBar, Style } = await import('@capacitor/status-bar')
    const { SplashScreen } = await import('@capacitor/splash-screen')
    await StatusBar.setStyle({ style: Style.Dark })
    await StatusBar.setBackgroundColor({ color: '#F6F1E7' })
    await SplashScreen.hide()
  } catch {
    // Web / PWA — Capacitor plugins are optional
  }
}

/**
 * Kill stale service workers + Cache Storage.
 * A previous Workbox navigateFallback was able to serve an old index.html
 * whose hashed JS bundle no longer existed — React never booted, and the
 * Get Started / Skip buttons looked dead for first-time visitors.
 */
async function nukeStaleServiceWorkers() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return
  try {
    const regs = await navigator.serviceWorker.getRegistrations()
    await Promise.all(regs.map((reg) => reg.unregister()))
    if (typeof caches !== 'undefined') {
      const keys = await caches.keys()
      await Promise.all(keys.map((k) => caches.delete(k)))
    }
  } catch {
    /* ignore */
  }
}

bootNativeShell()
nukeStaleServiceWorkers()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
