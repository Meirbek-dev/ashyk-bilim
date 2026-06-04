'use client'

import { useTranslations } from 'next-intl'
import { useEffect } from 'react'
import { reportClientError } from '@/services/telemetry/client'

export default function CourseError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations('Errors')

  useEffect(() => {
    console.error('Course Details Route Error Boundary Caught:', {
      message: error.message,
      name: error.name,
      digest: error.digest,
      stack: error.stack,
      cause: error.cause,
      timestamp: new Date().toISOString(),
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
    })

    void reportClientError({
      digest: error.digest,
      error: {
        cause: error.cause,
        message: error.message,
        name: error.name,
        stack: error.stack,
      },
      page: typeof globalThis.window !== 'undefined' ? globalThis.location.pathname : 'course-route',
      url: typeof globalThis.window !== 'undefined' ? globalThis.location.href : 'course-route',
    }).catch((loggingError: unknown) => {
      console.error('Failed to report course details route error boundary event:', loggingError)
    })
  }, [error])

  return (
    <div className="my-6 flex min-h-[400px] flex-col items-center justify-center rounded-xl border p-6 text-center">
      <div className="bg-destructive/10 text-destructive mb-4 flex h-10 w-10 items-center justify-center rounded-lg">
        <span className="text-xl">⚠</span>
      </div>
      <h3 className="mb-2 text-base font-semibold">{t('somethingWentWrong')}</h3>
      <p className="text-muted-foreground mb-6 max-w-md text-sm">{t('courseLoadError')}</p>

      {error.digest && (
        <p className="text-muted-foreground/60 mb-4 font-mono text-xs">{t('ref', { digest: error.digest })}</p>
      )}

      <button
        onClick={reset}
        className="bg-foreground text-background hover:bg-foreground/90 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors"
      >
        {t('tryAgain')}
      </button>
    </div>
  )
}
