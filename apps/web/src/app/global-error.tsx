'use client'

import { useEffect, useSyncExternalStore } from 'react'
import type { Viewport } from 'next'

import { ErrorState } from '@/components/ui/error-state'
import { reportClientError } from '@/services/telemetry/client'
import { ERROR_MESSAGES, detectLocale } from '@/lib/error-i18n'

const emptySubscribe = () => () => {}
const getLocaleSnapshot = () => detectLocale()
const getServerLocaleSnapshot = () => 'ru-RU' as const

/**
 * Viewport export is required in global-error.tsx because this component
 * replaces the entire root layout (including <head>) when a global error occurs.
 * Without this, the viewport meta tag is missing on mobile during a crash.
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
}

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const locale = useSyncExternalStore(emptySubscribe, getLocaleSnapshot, getServerLocaleSnapshot)

  useEffect(() => {
    void reportClientError({
      digest: error.digest,
      error: {
        message: error.message,
        name: error.name,
        stack: error.stack,
      },
      page: typeof globalThis.window !== 'undefined' ? globalThis.location.pathname : 'unknown',
      scope: 'global-error',
      url: typeof globalThis.window !== 'undefined' ? globalThis.location.href : 'unknown',
    }).catch(() => undefined)
  }, [error])

  const t = ERROR_MESSAGES[locale]
  const isChunkError = error?.name === 'ChunkLoadError' || /Failed to load chunk/i.test(error?.message || '')

  const handleRetry = () => {
    if (typeof globalThis.window === 'undefined') {
      reset()
      return
    }

    if (isChunkError) {
      globalThis.location.reload()
    } else {
      reset()
    }
  }

  return (
    <html lang={locale.split('-')[0]}>
      <body className="bg-background text-foreground min-h-screen">
        <ErrorState
          actionLabel={t.retry}
          description={isChunkError ? t.updateInfo : t.globalDescription}
          error={error}
          onAction={handleRetry}
          reference={error.digest}
          title={t.title}
          variant="page"
        />
      </body>
    </html>
  )
}
