'use client';

import type { ReactNode } from 'react';
import { AlertTriangle, BookOpen, Clock, FileEdit, Layers, Lock, RotateCcw, Timer } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { AttemptViewModel } from '@/features/assessments/domain/view-models';
import { isAntiCheatEnabled } from '@/features/assessments/domain/policy';

function formatSeconds(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m} min`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

interface AttemptEntryCardProps {
  vm: AttemptViewModel;
  isTeacher?: boolean;
}

export default function AttemptEntryCard({ vm, isTeacher = false }: AttemptEntryCardProps) {
  const t = useTranslations('Features.ActivityWorkspace');

  const { recommendedAction, policy, items } = vm;
  const isBlocked = recommendedAction === 'blocked';
  const isWaiting = recommendedAction === 'waitForRelease';
  const isRevision = recommendedAction === 'startRevision';

  const questionCount = items.length;
  const { timeLimitSeconds } = policy;
  const { maxAttempts } = policy;

  if (isBlocked) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-5 py-10 text-center">
        <div className="bg-destructive/10 flex size-16 items-center justify-center rounded-lg">
          <Lock className="text-destructive size-8" />
        </div>
        <h2 className="text-xl font-semibold tracking-tight">{vm.title}</h2>
        <p className="text-muted-foreground max-w-md text-sm">{t('assessmentBlocked')}</p>
      </div>
    );
  }

  if (isWaiting) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-5 py-10 text-center">
        <div className="bg-primary/10 flex size-16 items-center justify-center rounded-lg">
          <Timer className="text-primary size-8" />
        </div>
        <h2 className="text-xl font-semibold tracking-tight">{vm.title}</h2>
        <p className="text-muted-foreground max-w-md text-sm">{t('waitingForRelease')}</p>
      </div>
    );
  }

  const Icon = isRevision ? RotateCcw : BookOpen;

  return (
    <section className="mx-auto w-full max-w-6xl py-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <div className="flex items-start gap-4">
            <div className="bg-primary/10 flex size-12 shrink-0 items-center justify-center rounded-lg">
              <Icon className="text-primary size-6" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                  {getKindLabel(vm.kind)}
                </span>
                {isRevision ? (
                  <Badge
                    variant="secondary"
                    className="gap-1 text-xs"
                  >
                    <RotateCcw className="size-3" />
                    {t('revision')}
                  </Badge>
                ) : null}
              </div>
              <h2 className="text-2xl font-semibold tracking-tight">{vm.title}</h2>
              {vm.description ? (
                <p className="text-muted-foreground mt-2 max-w-4xl text-sm leading-6">{vm.description}</p>
              ) : null}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <MetricCard
              icon={<Layers className="size-4" />}
              label={t('questions')}
              value={questionCount > 0 ? String(questionCount) : '-'}
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

          {questionCount === 0 ? (
            <Alert
              variant="destructive"
              className="border-destructive/30 bg-destructive/5 text-destructive"
            >
              <AlertTriangle className="size-4" />
              <AlertTitle>{t('testNotReadyTitle')}</AlertTitle>
              <AlertDescription>
                {isTeacher ? t('teacherNoQuestionsWarning') : t('noQuestionsWarning')}
              </AlertDescription>
            </Alert>
          ) : isAntiCheatEnabled(vm.policy.antiCheat) ? (
            <Alert>
              <AlertTriangle className="size-4" />
              <AlertDescription>{t('antiCheatNotice')}</AlertDescription>
            </Alert>
          ) : null}
        </div>

        <aside className="space-y-4">
          <div className="rounded-lg border p-4">
            {questionCount === 0 ? (
              <>
                <div className="text-destructive text-sm font-semibold">{t('testNotReadyTitle')}</div>
                <p className="text-muted-foreground mt-1 text-sm">
                  {isTeacher ? t('teacherNoQuestionsSidebar') : t('noQuestionsSidebar')}
                </p>
              </>
            ) : (
              <>
                <div className="text-sm font-semibold">{isRevision ? t('revision') : t('readyToStart')}</div>
                <p className="text-muted-foreground mt-1 text-sm">{t('readyToStartSubtitle')}</p>
              </>
            )}
          </div>

          {policy.dueAt ? (
            <div className="rounded-lg border p-4">
              <div className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{t('dueDate')}</div>
              <div
                className={cn('mt-1 text-sm font-medium', new Date(policy.dueAt) < new Date() && 'text-destructive')}
              >
                {formatDate(policy.dueAt)}
              </div>
            </div>
          ) : null}
        </aside>
      </div>
    </section>
  );
}

function MetricCard({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="bg-muted/40 flex min-h-28 flex-col justify-between rounded-lg p-4">
      <span className="text-muted-foreground">{icon}</span>
      <span className="mt-3 text-2xl font-semibold tabular-nums">{value}</span>
      <span className="text-muted-foreground text-xs">{label}</span>
    </div>
  );
}

function getKindLabel(kind: string): string {
  switch (kind) {
    case 'TYPE_EXAM': {
      return 'Exam';
    }
    case 'TYPE_CUSTOM': {
      return 'Quiz';
    }
    case 'TYPE_CODE_CHALLENGE': {
      return 'Coding Challenge';
    }
    case 'TYPE_FILE_SUBMISSION': {
      return 'File Submission';
    }
    default: {
      return kind;
    }
  }
}
