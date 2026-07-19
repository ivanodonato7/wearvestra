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
 * Stale service workers can serve an old index.html that points at deleted
 * hashed assets — React never boots and the landing CTAs look dead.
 * If the document build meta disagrees with /version.json, wipe SW + caches.
 */
async function reconcileServiceWorkerBuild() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return
  try {
    const meta = document.querySelector('meta[name="vestra-build"]')?.content || ''
    const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' })
    if (!res.ok) return
    const data = await res.json()
    const remote = data?.build || ''
    if (!meta || !remote || meta === remote) {
      // Still nudge updates so deploys land
      const regs = await navigator.serviceWorker.getRegistrations()
      await Promise.all(regs.map((reg) => reg.update().catch(() => {})))
      return
    }
    const regs = await navigator.serviceWorker.getRegistrations()
    await Promise.all(regs.map((reg) => reg.unregister()))
    if (typeof caches !== 'undefined') {
      const keys = await caches.keys()
      await Promise.all(keys.map((k) => caches.delete(k)))
    }
    if (!sessionStorage.getItem('vestra.build.reload')) {
      sessionStorage.setItem('vestra.build.reload', '1')
      window.location.reload()
    }
  } catch {
    /* ignore */
  }
}

// When a new SW takes control mid-session, reload once so handlers match assets
if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  let refreshing = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return
    if (sessionStorage.getItem('vestra.sw.controller.reload')) return
    refreshing = true
    sessionStorage.setItem('vestra.sw.controller.reload', '1')
    window.location.reload()
  })
}

bootNativeShell()
reconcileServiceWorkerBuild()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
