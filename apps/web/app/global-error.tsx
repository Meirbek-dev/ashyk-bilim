'use client';

import { AlertTriangle, RotateCcw } from 'lucide-react';
import { useEffect } from 'react';
import * as React from 'react';

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { reportClientError } from '@/services/telemetry/client';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
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
    <html lang="ru">
      <body className="bg-background text-foreground min-h-screen">
        <main className="flex min-h-screen items-center justify-center px-4">
          <Card className="w-full max-w-lg shadow-lg">
            <CardHeader className="space-y-2">
              <div className="flex items-center gap-3">
                <div className="bg-destructive/10 text-destructive flex h-10 w-10 items-center justify-center rounded-full">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle>Что-то пошло не так</CardTitle>
                  <CardDescription>Произошла непредвиденная ошибка при загрузке страницы</CardDescription>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              <Alert variant="destructive">
                <AlertTitle>Ошибка</AlertTitle>
                <AlertDescription>
                  {error.message || 'Не удалось корректно обработать запрос. Попробуйте повторить попытку.'}
                </AlertDescription>
              </Alert>

              {error.digest && (
                <div className="text-muted-foreground flex items-center gap-2 text-sm">
                  <span>Идентификатор ошибки:</span>
                  <Badge variant="outline">{error.digest}</Badge>
                </div>
              )}

              {isChunkError && (
                <p className="text-muted-foreground text-sm">
                  Ошибка может быть связана с обновлением приложения или временной недоступностью ресурсов. Полная
                  перезагрузка страницы обычно решает проблему.
                </p>
              )}

              {process.env.NODE_ENV !== 'production' && error.stack && (
                <>
                  <Separator />
                  <details className="group bg-muted/50 rounded-md border p-3">
                    <summary className="cursor-pointer text-sm font-medium">Детали ошибки (dev)</summary>
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
                Повторить
              </Button>
            </CardFooter>
          </Card>
        </main>
      </body>
    </html>
  );
}
