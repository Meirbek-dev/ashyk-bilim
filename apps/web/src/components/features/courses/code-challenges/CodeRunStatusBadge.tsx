/**
 * Judge0-only execution status badges.
 *
 * User-facing submission workflow status is rendered by
 * features/assessments/shared/components/SubmissionStatusBadge.
 */

'use client';

import { AlertCircle, CheckCircle2, Clock, Loader2, XCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Judge0Status } from './TestCaseCard';

interface Judge0StatusBadgeProps {
  statusId: Judge0Status;
  statusDescription?: string;
  className?: string;
  showIcon?: boolean;
}

export function CodeRunStatusBadge(props: Judge0StatusBadgeProps) {
  return <Judge0StatusBadge {...props} />;
}

export function Judge0StatusBadge({ statusId, statusDescription, className, showIcon = true }: Judge0StatusBadgeProps) {
  const t = useTranslations('Activities.CodeChallenges');
  const config = getJudge0Config(statusId, statusDescription, t);
  const Icon = config.icon;

  return (
    <Badge
      variant={config.variant}
      className={cn('inline-flex items-center gap-1.5', className)}
    >
      {showIcon ? <Icon className={cn('size-3.5', config.animate && 'animate-spin')} /> : null}
      {config.label}
    </Badge>
  );
}

function getJudge0Config(statusId: Judge0Status, statusDescription: string | undefined, t: (key: string) => string) {
  switch (statusId) {
    case Judge0Status.IN_QUEUE: {
      return { variant: 'secondary' as const, icon: Clock, label: t('status.inQueue'), animate: false };
    }
    case Judge0Status.PROCESSING: {
      return { variant: 'warning' as const, icon: Loader2, label: t('status.processing'), animate: true };
    }
    case Judge0Status.ACCEPTED: {
      return { variant: 'success' as const, icon: CheckCircle2, label: t('status.accepted'), animate: false };
    }
    case Judge0Status.WRONG_ANSWER: {
      return { variant: 'destructive' as const, icon: XCircle, label: t('status.wrongAnswer'), animate: false };
    }
    case Judge0Status.TIME_LIMIT_EXCEEDED: {
      return { variant: 'warning' as const, icon: Clock, label: t('status.timeLimitExceeded'), animate: false };
    }
    case Judge0Status.COMPILATION_ERROR: {
      return {
        variant: 'destructive' as const,
        icon: AlertCircle,
        label: t('status.compilationError'),
        animate: false,
      };
    }
    case Judge0Status.RUNTIME_ERROR_SIGSEGV:
    case Judge0Status.RUNTIME_ERROR_SIGXFSZ:
    case Judge0Status.RUNTIME_ERROR_SIGFPE:
    case Judge0Status.RUNTIME_ERROR_SIGABRT:
    case Judge0Status.RUNTIME_ERROR_NZEC:
    case Judge0Status.RUNTIME_ERROR_OTHER: {
      return { variant: 'destructive' as const, icon: AlertCircle, label: t('status.runtimeError'), animate: false };
    }
    case Judge0Status.INTERNAL_ERROR:
    case Judge0Status.EXEC_FORMAT_ERROR: {
      return { variant: 'destructive' as const, icon: AlertCircle, label: t('status.internalError'), animate: false };
    }
    default: {
      return {
        variant: 'secondary' as const,
        icon: Clock,
        label: statusDescription || t('status.unknown'),
        animate: false,
      };
    }
  }
}
