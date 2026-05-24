'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { reportClientError } from '@/services/telemetry/client';

export default function GradebookError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations('Errors');

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
    }).catch(() => undefined);
  }, [error]);

  return (
    <div className="flex min-h-[480px] items-center justify-center p-6">
      <div className="w-full max-w-xl rounded-3xl border border-rose-200 bg-white p-6 shadow-lg dark:border-rose-900/40 dark:bg-slate-950">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-600">
            <AlertTriangle className="size-5" />
          </div>
          <div className="space-y-1">
            <h1 className="text-lg font-semibold">{t('gradebookLoadError')}</h1>
            <p className="text-muted-foreground text-sm">
              {t('gradebookLoadErrorDescription')}
            </p>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
          >
            <RotateCcw className="size-4" />
            {t('retry')}
          </button>
        </div>
      </div>
    </div>
  );
}

