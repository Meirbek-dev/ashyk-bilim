'use client';

import {
  AlertTriangle,
  BookOpen,
  Clock,
  FileEdit,
  Layers,
  Lock,
  RotateCcw,
  Timer,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { AttemptViewModel } from '@/features/assessments/domain/view-models';
import { isAntiCheatEnabled } from '@/features/assessments/domain/policy';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatSeconds(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m} min`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

// ── Component ─────────────────────────────────────────────────────────────────

interface AttemptEntryCardProps {
  vm: AttemptViewModel;
}

/**
 * Assessment pre-flight card.
 *
 * Single full-width card showing all the information the student needs before
 * starting. **No CTA inside this card** — the primary action button lives
 * exclusively in BottomActionBar (registered via ActivityLayoutContext by
 * InlineAssessmentWorkspace).
 *
 * Replaces the old two-card split (metric card + "ready" card).
 */
export default function AttemptEntryCard({ vm }: AttemptEntryCardProps) {
  const t = useTranslations('Features.ActivityWorkspace');

  const { recommendedAction, policy, items } = vm;
  const isBlocked = recommendedAction === 'blocked';
  const isWaiting = recommendedAction === 'waitForRelease';
  const isRevision = recommendedAction === 'startRevision';

  const questionCount = items.length;
  const timeLimitSeconds = policy.timeLimitSeconds;
  const maxAttempts = policy.maxAttempts;

  // ── Blocked state ───────────────────────────────────────────────────────────

  if (isBlocked) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-5 py-10 text-center">
        <div className="bg-destructive/10 flex size-16 items-center justify-center rounded-xl">
          <Lock className="text-destructive size-8" />
        </div>
        <h2 className="text-xl font-semibold tracking-tight">{vm.title}</h2>
        <p className="text-muted-foreground max-w-md text-sm">{t('assessmentBlocked')}</p>
      </div>
    );
  }

  // ── Waiting for release ─────────────────────────────────────────────────────

  if (isWaiting) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-5 py-10 text-center">
        <div className="bg-primary/10 flex size-16 items-center justify-center rounded-xl">
          <Timer className="text-primary size-8" />
        </div>
        <h2 className="text-xl font-semibold tracking-tight">{vm.title}</h2>
        <p className="text-muted-foreground max-w-md text-sm">{t('waitingForRelease')}</p>
      </div>
    );
  }

  // ── Normal pre-flight ───────────────────────────────────────────────────────

  const Icon = isRevision ? RotateCcw : BookOpen;

  return (
    <div className="mx-auto w-full max-w-2xl py-6">
      {/* Kind + title */}
      <div className="mb-6 flex items-start gap-4">
        <div className="bg-primary/10 flex size-12 shrink-0 items-center justify-center rounded-xl">
          <Icon className="text-primary size-6" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
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
            <p className="text-muted-foreground mt-1 text-sm leading-6">{vm.description}</p>
          ) : null}
        </div>
      </div>

      {/* Metrics row */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
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

      {/* Due date */}
      {policy.dueAt ? (
        <p className="text-muted-foreground mb-4 text-sm">
          {t('dueDate')}:{' '}
          <span
            className={cn(
              'font-medium',
              new Date(policy.dueAt) < new Date() && 'text-destructive',
            )}
          >
            {formatDate(policy.dueAt)}
          </span>
        </p>
      ) : null}

      {/* Anti-cheat notice */}
      {isAntiCheatEnabled(vm.policy.antiCheat) ? (
        <Alert className="mb-4">
          <AlertTriangle className="size-4" />
          <AlertDescription>{t('antiCheatNotice')}</AlertDescription>
        </Alert>
      ) : null}

      {/* Attempt history — not available from AttemptViewModel; omit */}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

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

// ── Helpers ───────────────────────────────────────────────────────────────────

function getKindLabel(kind: string): string {
  switch (kind) {
    case 'TYPE_EXAM':
      return 'Exam';
    case 'TYPE_CUSTOM':
      return 'Quiz';
    case 'TYPE_CODE_CHALLENGE':
      return 'Coding Challenge';
    case 'TYPE_FILE_SUBMISSION':
      return 'File Submission';
    default:
      return kind;
  }
}

