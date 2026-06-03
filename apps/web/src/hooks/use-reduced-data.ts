/**
 * useReducedData Hook
 *
 * Detects users on slow/expensive connections via:
 * 1. prefers-reduced-data (new standard)
 * 2. navigator.connection.saveData
 * 3. navigator.connection.effectiveType (slow-2g, 2g)
 *
 * Returns true if user prefers reduced data usage.
 */

import { useEffect, useState } from 'react'

interface NetworkInformationLike extends EventTarget {
  effectiveType?: string
  onchange?: EventListenerOrEventListenerObject | null
  saveData?: boolean
}

interface NavigatorWithConnection extends Navigator {
  connection?: NetworkInformationLike
  mozConnection?: NetworkInformationLike
  webkitConnection?: NetworkInformationLike
}

function getNetworkConnection(): NetworkInformationLike | undefined {
  const nav = navigator as NavigatorWithConnection
  return nav.connection ?? nav.mozConnection ?? nav.webkitConnection
}

export function useReducedData(): boolean {
  const [prefersReducedData, setPrefersReducedData] = useState(() => {
    if (typeof globalThis.window === 'undefined') return false

    // Check multiple signals
    let reduced = false

    // 1. Check prefers-reduced-data media query (new standard)
    const mediaQuery = globalThis.matchMedia('(prefers-reduced-data: reduce)')
    if (mediaQuery.matches) {
      reduced = true
    }

    // 2. Check Network Information API (saveData)
    const connection = getNetworkConnection()
    if (connection) {
      // Check saveData
      if (connection.saveData) {
        reduced = true
      }
      // Check slow connection types
      if (connection.effectiveType === 'slow-2g' || connection.effectiveType === '2g') {
        reduced = true
      }
    }

    return reduced
  })

  useEffect(() => {
    if (typeof globalThis.window === 'undefined') return

    const mediaQuery = globalThis.matchMedia('(prefers-reduced-data: reduce)')
    const connection = getNetworkConnection()

    // Handlers
    const handleChange = (event: MediaQueryListEvent) => {
      setPrefersReducedData(event.matches)
    }

    if ('addEventListener' in mediaQuery) {
      mediaQuery.addEventListener('change', handleChange)
    } else if ('addListener' in mediaQuery) {
      mediaQuery.addListener(handleChange)
    }

    let prevOnChange: EventListenerOrEventListenerObject | null = null
    const handleNetworkChange = () => {
      const saveData = connection?.saveData === true
      const slowConnection = connection?.effectiveType === 'slow-2g' || connection?.effectiveType === '2g'
      setPrefersReducedData(saveData || slowConnection || mediaQuery.matches)
    }

    if (connection) {
      if ('addEventListener' in connection) {
        connection.addEventListener('change', handleNetworkChange)
      } else {
        // preserve existing handler when present
        prevOnChange = Reflect.get(connection, 'onchange')
        Reflect.set(connection, 'onchange', handleNetworkChange)
      }
    }

    return () => {
      if ('removeEventListener' in mediaQuery) {
        mediaQuery.removeEventListener('change', handleChange)
      } else if ('removeListener' in mediaQuery) {
        mediaQuery.removeListener(handleChange)
      }

      if (connection) {
        if ('removeEventListener' in connection) {
          connection.removeEventListener('change', handleNetworkChange)
        } else {
          // restore previous handler if it existed
          Reflect.set(connection, 'onchange', prevOnChange)
        }
      }
    }
  }, [])

  return prefersReducedData
}
