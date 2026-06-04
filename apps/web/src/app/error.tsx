'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'
import { reportClientError } from '@/services/telemetry/client'
import { ERROR_MESSAGES, detectLocale } from '@/lib/error-i18n'
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
    <div className="flex min-h-svh items-center justify-center px-4">
      <div className="bg-card text-card-foreground w-full max-w-xl rounded-xl border p-6">
        <div className="flex items-start gap-3">
          <div className="bg-destructive/10 text-destructive flex h-10 w-10 shrink-0 items-center justify-center rounded-lg">
            <AlertTriangle className="size-5" />
          </div>
          <div className="space-y-1">
            <h1 className="text-base font-semibold">{t.title}</h1>
            <p className="text-muted-foreground text-sm">{t.description}</p>
          </div>
        </div>

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={reset}
            className="bg-foreground text-background hover:bg-foreground/90 inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors"
          >
            <RotateCcw className="size-3.5" />
            {t.retry}
          </button>
        </div>
      </div>
    </div>
  )
}
