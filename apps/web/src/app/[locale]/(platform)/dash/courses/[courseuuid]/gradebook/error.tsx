'use client'

import { useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { AlertTriangle, RotateCcw } from 'lucide-react'
import { reportClientError } from '@/services/telemetry/client'

export default function GradebookError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations('Errors')

  useEffect(() => {
    void reportClientError({
      digest: error.digest,
      error: {
        message: error.message,
        name: error.name,
        stack: error.stack,
      },
      page: typeof globalThis.window !== 'undefined' ? globalThis.location.pathname : 'gradebook',
      url: typeof globalThis.window !== 'undefined' ? globalThis.location.href : 'gradebook',
    }).catch(() => undefined)
  }, [error])

  return (
    <div className="flex min-h-[480px] items-center justify-center p-6">
      <div className="bg-card text-card-foreground w-full max-w-xl rounded-xl border p-6">
        <div className="flex items-start gap-3">
          <div className="bg-destructive/10 text-destructive flex h-10 w-10 shrink-0 items-center justify-center rounded-lg">
            <AlertTriangle className="size-5" />
          </div>
          <div className="space-y-1">
            <h1 className="text-base font-semibold">{t('gradebookLoadError')}</h1>
            <p className="text-muted-foreground text-sm">{t('gradebookLoadErrorDescription')}</p>
          </div>
        </div>

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={reset}
            className="bg-foreground text-background hover:bg-foreground/90 inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors"
          >
            <RotateCcw className="size-3.5" />
            {t('retry')}
          </button>
        </div>
      </div>
    </div>
  )
}
