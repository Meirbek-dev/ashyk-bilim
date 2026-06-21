'use client'

import { useEffect, useState } from 'react'
import { reportClientError } from '@/services/telemetry/client'
import { ERROR_MESSAGES, detectLocale } from '@/lib/error-i18n'
import { ErrorState } from '@/components/ui/error-state'
import type { SupportedLocale } from '@/lib/error-i18n'

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [locale, setLocale] = useState<SupportedLocale>('ru-RU')

  useEffect(() => {
    setLocale(detectLocale())

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
