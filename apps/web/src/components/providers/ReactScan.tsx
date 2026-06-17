'use client'

import { scan } from 'react-scan'
import { useEffect } from 'react'

export function ReactScan() {
  useEffect(() => {
    if (typeof globalThis.window !== 'undefined' && process.env.NODE_ENV === 'development') {
      scan({
        enabled: true,
      })
    }
  }, [])

  return null
}
