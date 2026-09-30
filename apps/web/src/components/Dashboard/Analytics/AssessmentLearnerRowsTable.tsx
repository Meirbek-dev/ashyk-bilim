'use client'

import { fromUnix } from '@/lib/api/contract'
import { DATE_TIME_OPTIONS, formatDate } from '@/lib/date'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { usePercentFormat } from '@/features/assessments/shared/usePercentFormat'
import { getAnalyticsStatusLabel } from '@/lib/analytics/labels'
import type { AssessmentLearnerRow } from '@/types/analytics'
import { useLocale, useTranslations } from 'next-intl'
import DataTable from '@/components/ui/data-table'
import type { DataTableColumnDef } from '@/components/ui/data-table'

interface AssessmentLearnerRowsTableProps {
  rows: AssessmentLearnerRow[]
  storageKey?: string
}

export default function AssessmentLearnerRowsTable({ rows, storageKey }: AssessmentLearnerRowsTableProps) {
  const t = useTranslations('TeacherAnalytics')
  const tWorkspace = useTranslations('Features.ActivityWorkspace')
  const locale = useLocale()
  const percent = usePercentFormat()

  const columns: DataTableColumnDef<AssessmentLearnerRow>[] = [
    {
      accessorKey: 'user_display_name',
      header: t('pages.assessmentColLearner'),
    },
    {
      accessorKey: 'attempts',
      header: t('pages.assessmentColAttempts'),
    },
    {
      accessorKey: 'best_score',
      header: t('pages.assessmentColBestScore'),
      cell: ({ row }) => (row.original.best_score == null ? t('atRisk.na') : percent(row.original.best_score)),
    },
    {
      accessorKey: 'last_score',
      header: t('pages.assessmentColLastScore'),
      cell: ({ row }) => (row.original.last_score == null ? t('atRisk.na') : percent(row.original.last_score)),
    },
    {
      accessorKey: 'submitted_at',
      header: t('pages.assessmentColSubmitted'),
      // Intl output for kk-KZ differs between the server's ICU and a client without kk data; keep the server text.
      cell: ({ row }) => (
        <span suppressHydrationWarning>
          {row.original.submitted_at_unix
            ? formatDate(fromUnix(row.original.submitted_at_unix), locale, DATE_TIME_OPTIONS)
            : t('atRisk.na')}
        </span>
      ),
    },
    {
      accessorFn: row => row.status || '',
      id: 'status',
      header: t('pages.assessmentColStatus'),
      // UX-138: the status is the grade of record's; a newer attempt still with
      // the teacher is flagged like the gradebook cell (BUG-175 rule).
      cell: ({ row }) => {
        const { status, pending_attempt } = row.original
        const retake = status === 'pending' || status === 'graded' ? null : pending_attempt
        return (
          <span className="flex flex-col">
            <span>{getAnalyticsStatusLabel(t, status)}</span>
            {typeof retake === 'number' ? (
              <span className="text-muted-foreground text-xs">{tWorkspace('pendingAttempt', { attempt: retake })}</span>
            ) : null}
          </span>
        )
      },
    },
  ]

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle>{t('pages.assessmentLearnerRowsTitle')}</CardTitle>
      </CardHeader>
      <CardContent>
        <DataTable
          columns={columns}
          data={rows}
          pageSize={10}
          {...(storageKey ? { storageKey } : {})}
          labels={{
            emptyMessage: t('table.emptyDefault'),
            searchPlaceholder: t('table.searchDefault'),
          }}
        />
      </CardContent>
    </Card>
  )
}
