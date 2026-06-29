'use client'

import { useEffect, useSyncExternalStore } from 'react'
import { reportClientError } from '@/services/telemetry/client'
import { ERROR_MESSAGES, detectLocale } from '@/lib/error-i18n'
import { ErrorState } from '@/components/ui/error-state'

const emptySubscribe = () => () => {}
const getLocaleSnapshot = () => detectLocale()
const getServerLocaleSnapshot = () => 'ru-RU' as const

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const locale = useSyncExternalStore(emptySubscribe, getLocaleSnapshot, getServerLocaleSnapshot)

  useEffect(() => {
    void reportClientError({
      digest: error.digest,
      error: {
        message: error.message,
        name: error.name,
        stack: error.stack,
      },
      page: typeof globalThis.window !== 'undefined' ? globalThis.location.pathname : 'app-error',
      url: typeof globalThis.window !== 'undefined' ? globalThis.location.href : 'app-error',
    }).catch(() => undefined)
  }, [error])

  const t = ERROR_MESSAGES[locale]

  return (
    <ErrorState
      variant="page"
      title={t.title}
      description={t.description}
      error={error}
      reference={error.digest}
      actionLabel={t.retry}
      onAction={reset}
    />
  )
}
