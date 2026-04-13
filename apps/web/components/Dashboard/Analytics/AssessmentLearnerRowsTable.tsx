'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getAnalyticsStatusLabel } from '@/lib/analytics/labels';
import type { AssessmentLearnerRow } from '@/types/analytics';
import type { ColumnDef } from '@tanstack/react-table';
import { useLocale, useTranslations } from 'next-intl';
import DataTable from '@/components/ui/data-table';

interface AssessmentLearnerRowsTableProps {
  rows: AssessmentLearnerRow[];
  storageKey?: string;
}

export default function AssessmentLearnerRowsTable({ rows, storageKey }: AssessmentLearnerRowsTableProps) {
  const t = useTranslations('TeacherAnalytics');
  const locale = useLocale();

  const columns: ColumnDef<AssessmentLearnerRow>[] = [
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
      cell: ({ row }) => row.original.best_score ?? t('atRisk.na'),
    },
    {
      accessorKey: 'last_score',
      header: t('pages.assessmentColLastScore'),
      cell: ({ row }) => row.original.last_score ?? t('atRisk.na'),
    },
    {
      accessorKey: 'submitted_at',
      header: t('pages.assessmentColSubmitted'),
      cell: ({ row }) =>
        row.original.submitted_at ? new Date(row.original.submitted_at).toLocaleString(locale) : t('atRisk.na'),
    },
    {
      accessorFn: (row) => row.status || '',
      id: 'status',
      header: t('pages.assessmentColStatus'),
      cell: ({ row }) => getAnalyticsStatusLabel(t, row.original.status),
    },
  ];

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
          storageKey={storageKey}
          labels={{
            emptyMessage: t('table.emptyDefault'),
            searchPlaceholder: t('table.searchDefault'),
          }}
        />
      </CardContent>
    </Card>
  );
}
