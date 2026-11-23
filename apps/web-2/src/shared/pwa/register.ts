const REPLAY = { type: 'replay' }

/**
 * Installs /sw.js (sw.ts) in production builds; `vp dev` has none. Asks it to send queued autosaves once it runs and
 * whenever the browser comes back online. A browser without service workers (or one that refuses: a private window)
 * simply goes without: pages and autosave work as before.
 */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  const container = navigator.serviceWorker
  const replay = () => void container.ready.then(registration => registration.active?.postMessage(REPLAY))
  container.register('/sw.js', { scope: '/', updateViaCache: 'none' }).then(replay, () => undefined)
  globalThis.addEventListener('online', replay)
}
