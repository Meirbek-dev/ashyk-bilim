'use client'

import { useEffect } from 'react'
import { reportClientError, serializeClientError } from '@/services/telemetry/client'

function pageContext(): Record<string, unknown> {
  if (typeof globalThis.window === 'undefined') return {}
  return {
    page: globalThis.location.pathname,
    url: globalThis.location.href,
  }
}

export function BrowserErrorReporter() {
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      void reportClientError({
        scope: 'browser-global',
        phase: 'window-error',
        ...pageContext(),
        error: serializeClientError(event.error ?? event.message),
      }).catch(() => undefined)
    }

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      void reportClientError({
        scope: 'browser-global',
        phase: 'unhandled-rejection',
        ...pageContext(),
        error: serializeClientError(event.reason),
      }).catch(() => undefined)
    }

    globalThis.window.addEventListener('error', handleError)
    globalThis.window.addEventListener('unhandledrejection', handleUnhandledRejection)
    return () => {
      globalThis.window.removeEventListener('error', handleError)
      globalThis.window.removeEventListener('unhandledrejection', handleUnhandledRejection)
    }
  }, [])

  return null
}
