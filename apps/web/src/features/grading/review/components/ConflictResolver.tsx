'use client';

/**
 * ConflictResolver — Shown when a 412 Precondition Failed response indicates
 * another teacher has graded the same submission concurrently.
 *
 * Presents the server's current state alongside the teacher's local draft
 * and offers options to accept server values or force-overwrite.
 */

import { AlertTriangle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

interface ConflictResolverProps {
  serverScore: number | null;
  serverFeedback: string;
  localScore: string;
  localFeedback: string;
  onAcceptServer: () => void;
  onKeepLocal: () => void;
}

export default function ConflictResolver({
  serverScore,
  serverFeedback,
  localScore,
  localFeedback,
  onAcceptServer,
  onKeepLocal,
}: ConflictResolverProps) {
  const t = useTranslations('Features.Grading.Review.ConflictResolver');

  return (
    <Alert className="border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
      <AlertTriangle className="size-4" />
      <AlertTitle>{t('title')}</AlertTitle>
      <AlertDescription className="mt-2 space-y-3">
        <p className="text-xs">{t('description')}</p>

        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="rounded border p-2">
            <p className="mb-1 font-medium">{t('serverHeader')}</p>
            <p>
              {t('scoreLabel')} <strong>{serverScore ?? '—'}</strong>
            </p>
            <p className="truncate">
              {t('feedbackLabel')} {serverFeedback || '—'}
            </p>
          </div>
          <div className="rounded border p-2">
            <p className="mb-1 font-medium">{t('localHeader')}</p>
            <p>
              {t('scoreLabel')} <strong>{localScore || '—'}</strong>
            </p>
            <p className="truncate">
              {t('feedbackLabel')} {localFeedback || '—'}
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={onAcceptServer}
          >
            {t('useServer')}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs"
            onClick={onKeepLocal}
          >
            {t('keepLocal')}
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
