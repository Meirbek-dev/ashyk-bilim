'use client';

import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { reportClientError } from '@/services/telemetry/client';

export default function CourseError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations('Errors');

  useEffect(() => {
    console.error('Course Details Route Error Boundary Caught:', {
      message: error.message,
      name: error.name,
      digest: error.digest,
      stack: error.stack,
      cause: error.cause,
      timestamp: new Date().toISOString(),
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
    });

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
      console.error('Failed to report course details route error boundary event:', loggingError);
    });
  }, [error]);

  return (
    <div className="my-6 flex min-h-[400px] flex-col items-center justify-center rounded-lg border border-zinc-200 bg-white p-6 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <h3 className="mb-2 text-xl font-semibold text-zinc-900 dark:text-zinc-50">{t('somethingWentWrong')}</h3>
      <p className="mb-6 max-w-md text-sm text-zinc-500 dark:text-zinc-400">
        {t('courseLoadError')}
      </p>

      {error.digest && <p className="mb-4 font-mono text-xs text-zinc-400 dark:text-zinc-500">{t('ref', { digest: error.digest })}</p>}

      <button
        onClick={reset}
        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-50 transition-colors hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        {t('tryAgain')}
      </button>
    </div>
  );
}

