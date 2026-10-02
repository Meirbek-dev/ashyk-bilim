import * as v from 'valibot'

import { storageItem } from './storage'

const lastPreloadReload = storageItem('ab.preload-reload-at', v.number(), 'session')

/** Sends a browser error to the web server's POST /_client-error (logged as JSON, spec 7.11). */
export function reportClientError(kind: string, error: unknown): void {
  const report = {
    kind,
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack?.slice(0, 4000) : undefined,
    path: location.pathname,
  }
  navigator.sendBeacon('/_client-error', new Blob([JSON.stringify(report)], { type: 'application/json' }))
}

export function installClientErrorReporting(): void {
  window.addEventListener('error', event => reportClientError('error', event.error ?? event.message))
  window.addEventListener('unhandledrejection', event => reportClientError('unhandledrejection', event.reason))
  // A deploy replaced the hashed chunks this tab still references: reload once, not in a loop.
  window.addEventListener('vite:preloadError', event => {
    const last = lastPreloadReload.get()
    if (last !== null && Date.now() - last < 60_000) return
    event.preventDefault()
    lastPreloadReload.set(Date.now())
    location.reload()
  })
}
