'use client';

import { BookOpen, CheckCircle2, Clock, FileEdit, Layers, Lock, RotateCcw, Timer } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { AttemptViewModel } from '@/features/assessments/domain/view-models';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatSeconds(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m} min`;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface AttemptEntryCardProps {
  vm: AttemptViewModel;
  onStart: () => void;
  isPending?: boolean;
}

/**
 * Pre-flight card rendered before the student starts an assessment attempt.
 * Displays key metrics (questions, time limit, attempts remaining) and the
 * primary CTA derived from `vm.recommendedAction`.
 */
export default function AttemptEntryCard({ vm, onStart, isPending = false }: AttemptEntryCardProps) {
  const t = useTranslations('Features.ActivityWorkspace');

  const { recommendedAction, policy, items } = vm;
  const isBlocked = recommendedAction === 'blocked';
  const isWaiting = recommendedAction === 'waitForRelease';
  const isRevision = recommendedAction === 'startRevision';
  const canAct = recommendedAction === 'start' || isRevision;

  const questionCount = items.length;
  const timeLimitSeconds = policy.timeLimitSeconds;
  const maxAttempts = policy.maxAttempts;

  return (
    <div className="mx-auto flex min-h-[28rem] w-full max-w-2xl flex-col items-center justify-center gap-6 py-10">
      {/* Icon */}
      <div
        className={cn(
          'flex size-16 items-center justify-center rounded-xl',
          isBlocked ? 'bg-destructive/10' : 'bg-primary/10',
        )}
      >
        {isBlocked ? (
          <Lock className="size-8 text-destructive" />
        ) : isWaiting ? (
          <Timer className="size-8 text-primary" />
        ) : isRevision ? (
          <RotateCcw className="size-8 text-primary" />
        ) : (
          <BookOpen className="size-8 text-primary" />
        )}
      </div>

      {/* Title + description */}
      <div className="space-y-2 text-center">
        <h2 className="text-2xl font-semibold tracking-tight">{vm.title}</h2>
        {vm.description ? <p className="text-muted-foreground max-w-lg text-sm leading-6">{vm.description}</p> : null}
      </div>

      {/* Status badge for revision */}
      {isRevision ? (
        <Badge
          variant="secondary"
          className="gap-1.5"
        >
          <RotateCcw className="size-3" />
          {t('revision')}
        </Badge>
      ) : null}

      {/* Metrics grid */}
      {!isBlocked && !isWaiting ? (
        <div className="grid w-full max-w-sm grid-cols-3 gap-3">
          <MetricCard
            icon={<Layers className="size-4" />}
            label={t('questions')}
            value={questionCount > 0 ? String(questionCount) : '—'}
          />
          <MetricCard
            icon={<Clock className="size-4" />}
            label={t('timeLimit')}
            value={timeLimitSeconds ? formatSeconds(timeLimitSeconds) : t('unlimited')}
          />
          <MetricCard
            icon={<FileEdit className="size-4" />}
            label={t('attempts')}
            value={maxAttempts ? String(maxAttempts) : t('unlimited')}
          />
        </div>
      ) : null}

      {/* Due date */}
      {policy.dueAt && !isBlocked ? (
        <p className="text-muted-foreground text-sm">
          {t('dueDate')}: <span className="font-medium">{new Date(policy.dueAt).toLocaleString()}</span>
        </p>
      ) : null}

      {/* Blocked message */}
      {isBlocked ? (
        <Alert className="max-w-sm">
          <Lock className="size-4" />
          <AlertDescription>{t('assessmentBlocked')}</AlertDescription>
        </Alert>
      ) : null}

      {/* Waiting for release */}
      {isWaiting ? (
        <div className="flex flex-col items-center gap-2 text-center">
          <CheckCircle2 className="text-muted-foreground size-8" />
          <p className="text-muted-foreground max-w-sm text-sm">{t('waitingForRelease')}</p>
        </div>
      ) : null}

      {/* Primary CTA */}
      {canAct ? (
        <Button
          size="lg"
          className="min-w-[10rem]"
          onClick={onStart}
          disabled={isPending}
        >
          {isPending ? (
            <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          ) : isRevision ? (
            <>
              <RotateCcw className="size-4" />
              {t('startRevision')}
            </>
          ) : (
            <>
              <BookOpen className="size-4" />
              {t('startAssessment')}
            </>
          )}
        </Button>
      ) : null}
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="bg-muted/40 flex flex-col items-center gap-1.5 rounded-lg p-3 text-center">
      <span className="text-muted-foreground">{icon}</span>
      <span className="text-lg font-semibold tabular-nums">{value}</span>
      <span className="text-muted-foreground text-xs">{label}</span>
    </div>
  );
}
