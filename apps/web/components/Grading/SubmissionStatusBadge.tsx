import type { SubmissionStatus } from '@/types/grading';
import { STATUS_LABELS } from '@/types/grading';
import { Badge } from '@components/ui/badge';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

interface SubmissionStatusBadgeProps {
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
      {t(STATUS_LABEL_KEYS[status] ?? STATUS_LABELS[status] ?? status)}
    </Badge>
  );
}
