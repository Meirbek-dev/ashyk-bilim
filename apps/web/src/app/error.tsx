'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { reportClientError } from '@/services/telemetry/client';

const MESSAGES = {
  'ru-RU': {
    title: 'Что-то пошло не так',
    description:
      'Не удалось отобразить страницу. Вы можете повторить попытку или перезагрузить страницу, если ошибка повторится.',
    retry: 'Повторить',
  },
  'en-US': {
    title: 'Something went wrong',
    description: 'The page failed to render. You can retry, or reload if the error keeps returning.',
    retry: 'Retry',
  },
  'kk-KZ': {
    title: 'Бірдеңе дұрыс болмады',
    description:
      'Бетті көрсету мүмкін болмады. Әрекетті қайталауға немесе қате қайталана берсе, бетті қайта жүктеуге болады.',
    retry: 'Қайталау',
  },
};

type SupportedLocale = keyof typeof MESSAGES;

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [locale, setLocale] = useState<SupportedLocale>('ru-RU');

  useEffect(() => {
    const match = /NEXT_LOCALE=([^;]+)/.exec(document.cookie);
    const cookieLocale = match?.[1] as SupportedLocale;
    if (cookieLocale && MESSAGES[cookieLocale]) {
      setLocale(cookieLocale);
    }

    void reportClientError({
      digest: error.digest,
      error: {
        message: error.message,
        name: error.name,
        stack: error.stack,
      },
      page: typeof globalThis.window !== 'undefined' ? globalThis.location.pathname : 'app-error',
      url: typeof globalThis.window !== 'undefined' ? globalThis.location.href : 'app-error',
    }).catch(() => undefined);
  }, [error]);

  const t = MESSAGES[locale];

  return (
    <div className="flex min-h-svh items-center justify-center px-4">
      <div className="w-full max-w-xl rounded-3xl border border-rose-200 bg-white p-6 shadow-lg dark:border-rose-900/40 dark:bg-slate-950">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-600">
            <AlertTriangle className="size-5" />
          </div>
          <div className="space-y-1">
            <h1 className="text-lg font-semibold">{t.title}</h1>
            <p className="text-muted-foreground text-sm">{t.description}</p>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
          >
            <RotateCcw className="size-4" />
            {t.retry}
          </button>
        </div>
      </div>
    </div>
  );
}
