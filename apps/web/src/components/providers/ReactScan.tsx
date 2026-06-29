'use client'

import { useEffect } from 'react'

export function ReactScan() {
  useEffect(() => {
    if (typeof globalThis.window !== 'undefined' && process.env.NODE_ENV === 'development') {
      import('react-scan')
        .then(({ scan }) => {
          scan({
            enabled: true,
          })
          return null
        })
        .catch((error: unknown) => {
          console.error('Failed to load react-scan:', error)
        })
    }
  }, [])

  return null
}
