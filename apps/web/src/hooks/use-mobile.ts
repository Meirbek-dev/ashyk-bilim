import * as React from 'react'

const MOBILE_BREAKPOINT = 768
const MOBILE_MEDIA_QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`

function subscribe(callback: () => void) {
  if (typeof globalThis.window === 'undefined') {
    return () => undefined
  }

  const mediaQueryList = globalThis.matchMedia(MOBILE_MEDIA_QUERY)
  const handler = () => {
    callback()
  }

  mediaQueryList.addEventListener('change', handler)
  return () => mediaQueryList.removeEventListener('change', handler)
}

function getSnapshot() {
  if (typeof globalThis.window === 'undefined') {
    return false
  }

  return globalThis.matchMedia(MOBILE_MEDIA_QUERY).matches
}

export function useIsMobile() {
  return React.useSyncExternalStore(subscribe, getSnapshot, () => false)
}

export { MOBILE_BREAKPOINT }

/** `matchMedia(query).matches`, live; `false` on the server. */
export function useMediaQuery(query: string) {
  return React.useSyncExternalStore(
    callback => {
      const list = globalThis.matchMedia(query)
      list.addEventListener('change', callback)
      return () => list.removeEventListener('change', callback)
    },
    () => globalThis.matchMedia(query).matches,
    () => false,
  )
}
