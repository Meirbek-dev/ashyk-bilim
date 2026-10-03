import { useSyncExternalStore } from 'react'

function subscribe(onChange: () => void) {
  window.addEventListener('online', onChange)
  window.addEventListener('offline', onChange)
  return () => {
    window.removeEventListener('online', onChange)
    window.removeEventListener('offline', onChange)
  }
}

/** The browser's own idea of the network (Playwright's `setOffline` flips it too). */
export const useOnline = () =>
  useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  )
