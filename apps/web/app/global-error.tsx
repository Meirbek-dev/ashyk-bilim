'use client';

import { AlertTriangle, RotateCcw } from 'lucide-react';
import { useEffect, useState } from 'react';
import * as React from 'react';

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { reportClientError } from '@/services/telemetry/client';

const MESSAGES = {
  'ru-RU': {
    title: 'Что-то пошло не так',
    description: 'Произошла непредвиденная ошибка при загрузке страницы',
    error: 'Ошибка',
    errorId: 'Идентификатор ошибки:',
    updateInfo:
      'Ошибка может быть связана с обновлением приложения или временной недоступностью ресурсов. Полная перезагрузка страницы обычно решает проблему.',
    devDetails: 'Детали ошибки (dev)',
    retry: 'Повторить',
    defaultError: 'Не удалось корректно обработать запрос. Попробуйте повторить попытку.',
  },
  'en-US': {
    title: 'Something went wrong',
    description: 'An unexpected error occurred while loading the page',
    error: 'Error',
    errorId: 'Error ID:',
    updateInfo:
      'The error might be related to an application update or temporary unavailability of resources. A full page reload usually solves the problem.',
    devDetails: 'Error details (dev)',
    retry: 'Retry',
    defaultError: 'Failed to correctly process the request. Please try again.',
  },
  'kk-KZ': {
    title: 'Бірдеңе дұрыс болмады',
    description: 'Бетті жүктеу кезінде күтпеген қате орын алды',
    error: 'Қате',
    errorId: 'Қате идентификаторы:',
    updateInfo:
      'Қате қолданбаның жаңартылуына немесе ресурстардың уақытша қолжетімсіздігіне байланысты болуы мүмкін. Бетті толық қайта жүктеу әдетте мәселені шешеді.',
    devDetails: 'Қате туралы мәліметтер (dev)',
    retry: 'Қайталау',
    defaultError: 'Сұранысты дұрыс өңдеу мүмкін болмады. Қайталап көріңіз.',
  },
};

type SupportedLocale = keyof typeof MESSAGES;

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [locale, setLocale] = useState<SupportedLocale>('ru-RU');

  useEffect(() => {
    const match = document.cookie.match(/NEXT_LOCALE=([^;]+)/);
    const cookieLocale = match?.[1] as SupportedLocale;
    if (cookieLocale && MESSAGES[cookieLocale]) {
      setLocale(cookieLocale);
    }

    console.error('Global Error Caught:', {
      message: error.message,
      name: error.name,
      digest: error.digest,
      stack: error.stack,
      timestamp: new Date().toISOString(),
    });

    void reportClientError({
      digest: error.digest,
      error: {
        message: error.message,
        name: error.name,
        stack: error.stack,
      },
      page: typeof globalThis.window !== 'undefined' ? globalThis.location.pathname : 'unknown',
      url: typeof globalThis.window !== 'undefined' ? globalThis.location.href : 'unknown',
    }).catch((loggingError: unknown) => {
      console.error('Failed to report global error boundary event:', loggingError);
    });
  }, [error]);

  const t = MESSAGES[locale];
  const isChunkError = error?.name === 'ChunkLoadError' || /Failed to load chunk/i.test(error?.message || '');

  const handleRetry = () => {
    if (typeof globalThis.window === 'undefined') {
      reset();
      return;
    }

    if (isChunkError) {
      globalThis.location.reload();
    } else {
      reset();
    }
  };

  return (
    <html lang={locale.split('-')[0]}>
      <body className="bg-background text-foreground min-h-screen">
        <main className="flex min-h-screen items-center justify-center px-4">
          <Card className="w-full max-w-lg shadow-lg">
            <CardHeader className="space-y-2">
              <div className="flex items-center gap-3">
                <div className="bg-destructive/10 text-destructive flex h-10 w-10 items-center justify-center rounded-full">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle>{t.title}</CardTitle>
                  <CardDescription>{t.description}</CardDescription>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              <Alert variant="destructive">
                <AlertTitle>{t.error}</AlertTitle>
                <AlertDescription>{error.message || t.defaultError}</AlertDescription>
              </Alert>

              {error.digest && (
                <div className="text-muted-foreground flex items-center gap-2 text-sm">
                  <span>{t.errorId}</span>
                  <Badge variant="outline">{error.digest}</Badge>
                </div>
              )}

              {isChunkError && <p className="text-muted-foreground text-sm">{t.updateInfo}</p>}

              {process.env.NODE_ENV !== 'production' && error.stack && (
                <>
                  <Separator />
                  <details className="group bg-muted/50 rounded-md border p-3">
                    <summary className="cursor-pointer text-sm font-medium">{t.devDetails}</summary>
                    <pre className="text-muted-foreground mt-2 max-h-64 overflow-auto text-xs break-all whitespace-pre-wrap">
                      {error.stack}
                    </pre>
                  </details>
                </>
              )}
            </CardContent>

            <CardFooter className="flex justify-end gap-3">
              <Button
                onClick={handleRetry}
                className="gap-2"
              >
                <RotateCcw className="h-4 w-4" />
                {t.retry}
              </Button>
            </CardFooter>
          </Card>
        </main>
      </body>
    </html>
  );
}
