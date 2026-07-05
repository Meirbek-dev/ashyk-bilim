/**
 * Canonical SubmissionStatusBadge for the unified submission workflow.
 *
 * Covers the five states from `features/assessments/domain/submission-status.ts`:
 *   DRAFT | PENDING | GRADED | PUBLISHED | RETURNED
 *
 * For Judge0 code-execution feedback use `Judge0StatusBadge` from
 * `components/features/courses/code-challenges/CodeRunStatusBadge`.
 */

import type { SubmissionStatus } from '@/features/grading/domain/types'
import { getSubmissionStatusLabel } from '@/features/grading/domain'
import { Badge } from '@/components/ui/badge'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'

export interface SubmissionStatusBadgeProps {
  status: SubmissionStatus | null | undefined
  className?: string
}

export default function SubmissionStatusBadge({ status, className }: SubmissionStatusBadgeProps) {
  const t = useTranslations('Grading.Table')

  return (
    <Badge
      variant={getStatusVariant(status)}
      className={cn('inline-flex items-center text-xs font-semibold', className)}
    >
      {getSubmissionStatusLabel(status, key => t(key))}
    </Badge>
  )
}

function getStatusVariant(
  status: SubmissionStatus | null | undefined,
): 'secondary' | 'warning' | 'success' | 'default' | 'destructive' {
  switch (status) {
    case 'PENDING': {
      return 'warning'
    }
    case 'GRADED': {
      return 'success'
    }
    case 'PUBLISHED': {
      return 'default'
    }
    case 'RETURNED': {
      return 'destructive'
    }
    case 'DRAFT':
    default: {
      return 'secondary'
    }
  }
}
