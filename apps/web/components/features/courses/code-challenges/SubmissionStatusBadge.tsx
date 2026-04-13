'use client';

import { AlertCircle, CheckCircle2, Clock, Loader2, XCircle } from 'lucide-react';
import type { VariantProps } from 'class-variance-authority';
import { cva } from 'class-variance-authority';
import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';

import { Judge0Status } from './TestCaseCard';

const submissionBadgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        pending: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
        processing: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300',
        accepted: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300',
        failed: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
        error: 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300',
        partial: 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300',
      },
      size: {
        sm: 'px-2 py-0.5 text-xs',
        default: 'px-2.5 py-0.5 text-xs',
        lg: 'px-3 py-1 text-sm',
      },
    },
    defaultVariants: {
      variant: 'pending',
      size: 'default',
    },
  },
);

type SubmissionStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'error';

interface SubmissionStatusBadgeProps extends VariantProps<typeof submissionBadgeVariants> {
  status: SubmissionStatus;
  score?: number;
  maxScore?: number;
  className?: string;
  showIcon?: boolean;
}

export function SubmissionStatusBadge({
  status,
  score,
  maxScore = 100,
  size,
  className,
  showIcon = true,
}: SubmissionStatusBadgeProps) {
  const t = useTranslations('Activities.CodeChallenges');

  const getConfig = () => {
    switch (status) {
      case 'pending': {
        return {
          variant: 'pending' as const,
          icon: Clock,
          label: t('submission.pending'),
          animate: false,
        };
      }
      case 'processing': {
        return {
          variant: 'processing' as const,
          icon: Loader2,
          label: t('submission.processing'),
          animate: true,
        };
      }
      case 'completed': {
        // Determine variant based on score
        if (score !== undefined) {
          if (score >= maxScore) {
            return {
              variant: 'accepted' as const,
              icon: CheckCircle2,
              label: t('submission.accepted'),
              animate: false,
            };
          } else if (score > 0) {
            return {
              variant: 'partial' as const,
              icon: AlertCircle,
              label: `${score}/${maxScore}`,
              animate: false,
            };
          } else {
            return {
              variant: 'failed' as const,
              icon: XCircle,
              label: t('submission.failed'),
              animate: false,
            };
          }
        }
        return {
          variant: 'accepted' as const,
          icon: CheckCircle2,
          label: t('submission.completed'),
          animate: false,
        };
      }
      case 'failed': {
        return {
          variant: 'failed' as const,
          icon: XCircle,
          label: t('submission.failed'),
          animate: false,
        };
      }
      case 'error': {
        return {
          variant: 'error' as const,
          icon: AlertCircle,
          label: t('submission.error'),
          animate: false,
        };
      }
      default: {
        return {
          variant: 'pending' as const,
          icon: Clock,
          label: t('submission.unknown'),
          animate: false,
        };
      }
    }
  };

  const config = getConfig();
  const Icon = config.icon;

  return (
    <span className={cn(submissionBadgeVariants({ variant: config.variant, size }), className)}>
      {showIcon && <Icon className={cn('h-3.5 w-3.5', config.animate && 'animate-spin')} />}
      {config.label}
    </span>
  );
}

interface Judge0StatusBadgeProps {
  statusId: Judge0Status;
  statusDescription?: string;
  size?: 'sm' | 'default' | 'lg';
  className?: string;
  showIcon?: boolean;
}

export function Judge0StatusBadge({
  statusId,
  statusDescription,
  size = 'default',
  className,
  showIcon = true,
}: Judge0StatusBadgeProps) {
  const t = useTranslations('Activities.CodeChallenges');

  const getConfig = () => {
    switch (statusId) {
      case Judge0Status.IN_QUEUE: {
        return {
          variant: 'pending' as const,
          icon: Clock,
          label: t('status.inQueue'),
          animate: false,
        };
      }
      case Judge0Status.PROCESSING: {
        return {
          variant: 'processing' as const,
          icon: Loader2,
          label: t('status.processing'),
          animate: true,
        };
      }
      case Judge0Status.ACCEPTED: {
        return {
          variant: 'accepted' as const,
          icon: CheckCircle2,
          label: t('status.accepted'),
          animate: false,
        };
      }
      case Judge0Status.WRONG_ANSWER: {
        return {
          variant: 'failed' as const,
          icon: XCircle,
          label: t('status.wrongAnswer'),
          animate: false,
        };
      }
      case Judge0Status.TIME_LIMIT_EXCEEDED: {
        return {
          variant: 'error' as const,
          icon: Clock,
          label: t('status.timeLimitExceeded'),
          animate: false,
        };
      }
      case Judge0Status.COMPILATION_ERROR: {
        return {
          variant: 'error' as const,
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
        return {
          variant: 'error' as const,
          icon: AlertCircle,
          label: t('status.runtimeError'),
          animate: false,
        };
      }
      case Judge0Status.INTERNAL_ERROR:
      case Judge0Status.EXEC_FORMAT_ERROR: {
        return {
          variant: 'error' as const,
          icon: AlertCircle,
          label: t('status.internalError'),
          animate: false,
        };
      }
      default: {
        return {
          variant: 'pending' as const,
          icon: Clock,
          label: statusDescription || t('status.unknown'),
          animate: false,
        };
      }
    }
  };

  const config = getConfig();
  const Icon = config.icon;

  return (
    <span className={cn(submissionBadgeVariants({ variant: config.variant, size }), className)}>
      {showIcon && <Icon className={cn('h-3.5 w-3.5', config.animate && 'animate-spin')} />}
      {config.label}
    </span>
  );
}

export default SubmissionStatusBadge;
