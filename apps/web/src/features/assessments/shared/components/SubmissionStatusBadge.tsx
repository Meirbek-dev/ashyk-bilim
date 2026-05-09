/**
 * Canonical SubmissionStatusBadge for the unified submission workflow.
 *
 * Covers the five states from `features/assessments/domain/submission-status.ts`:
 *   DRAFT | PENDING | GRADED | PUBLISHED | RETURNED
 *
 * For Judge0 code-execution feedback use `Judge0StatusBadge` from
 * `components/features/courses/code-challenges/CodeRunStatusBadge`.
 */

import type { SubmissionStatus } from '@/features/grading/domain/types';
import { SUBMISSION_STATUS_LABELS } from '@/features/grading/domain';
import { Badge } from '@/components/ui/badge';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

export interface SubmissionStatusBadgeProps {
  status: SubmissionStatus;
  className?: string;
}

const STATUS_VARIANTS: Record<SubmissionStatus, 'secondary' | 'warning' | 'success' | 'default' | 'destructive'> = {
  DRAFT: 'secondary',
  PENDING: 'warning',
  GRADED: 'success',
  PUBLISHED: 'default',
  RETURNED: 'destructive',
};

// Maps to next-intl keys under Grading.Table
const STATUS_LABEL_KEYS: Record<SubmissionStatus, string> = {
  DRAFT: 'statusDraft',
  PENDING: 'statusPending',
  GRADED: 'statusGraded',
  PUBLISHED: 'statusPublished',
  RETURNED: 'statusReturned',
};

export default function SubmissionStatusBadge({ status, className }: SubmissionStatusBadgeProps) {
  const t = useTranslations('Grading.Table');

  return (
    <Badge
      variant={STATUS_VARIANTS[status] ?? 'default'}
      className={cn('inline-flex items-center text-xs font-semibold', className)}
    >
      {t(STATUS_LABEL_KEYS[status] ?? SUBMISSION_STATUS_LABELS[status] ?? status)}
    </Badge>
  );
}
