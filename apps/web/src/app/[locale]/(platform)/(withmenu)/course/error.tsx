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
    <div className="flex min-h-[400px] flex-col items-center justify-center p-6 border border-zinc-200 dark:border-zinc-800 rounded-lg bg-white dark:bg-zinc-950 shadow-sm text-center my-6">
      <h3 className="text-xl font-semibold mb-2 text-zinc-900 dark:text-zinc-50">{t('somethingWentWrong')}</h3>
      <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6 max-w-md">
        An error occurred while loading this course. Please try reloading or check back shortly.
      </p>

      {error.digest && (
        <p className="text-xs text-zinc-400 dark:text-zinc-500 mb-4 font-mono">
          Ref: {error.digest}
        </p>
      )}

      <button
        onClick={reset}
        className="bg-zinc-900 text-zinc-50 hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200 rounded-md px-4 py-2 text-sm font-medium transition-colors"
      >
        {t('tryAgain')}
      </button>
    </div>
  );
}
