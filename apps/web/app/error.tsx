'use client';

import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { reportClientError } from '@/services/telemetry/client';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations('Errors');

  useEffect(() => {
    console.error('Root Error Boundary Caught:', {
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
      page: typeof globalThis.window !== 'undefined' ? globalThis.location.pathname : 'unknown',
      url: typeof globalThis.window !== 'undefined' ? globalThis.location.href : 'unknown',
    }).catch((loggingError: unknown) => {
      console.error('Failed to report root error boundary event:', loggingError);
    });
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="max-w-md text-center">
        <h2 className="mb-4 text-2xl font-bold">{t('somethingWentWrong')}</h2>

        {error.digest && (
          <p className="text-muted-foreground dark:text-muted-foreground mb-4 text-sm">
            {t('errorReference')} <code className="bg-muted/70 text-foreground rounded px-2 py-1">{error.digest}</code>
          </p>
        )}

        {process.env.NODE_ENV !== 'production' && (
          <details className="mb-4 text-left">
            <summary className="cursor-pointer font-semibold">{t('technicalDetails')}</summary>
            <div className="bg-destructive/10 dark:bg-destructive/20 mt-2 rounded p-4">
              <p className="mb-2 font-mono text-sm">
                <strong>{t('errorLabel')}</strong> {error.message}
              </p>
              {error.stack && <pre className="overflow-auto text-xs">{error.stack}</pre>}
            </div>
          </details>
        )}

        <button
          onClick={reset}
          className="bg-primary text-primary-foreground hover:bg-primary/80 rounded-md px-6 py-2"
        >
          {t('tryAgain')}
        </button>
      </div>
    </div>
  );
}
