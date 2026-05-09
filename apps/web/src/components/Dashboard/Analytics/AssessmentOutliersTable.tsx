'use client';

import { getAnalyticsAssessmentTypeLabel, getAnalyticsReasonCodeLabel } from '@/lib/analytics/labels';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { AssessmentOutlierRow } from '@/types/analytics';
import type { ColumnDef } from '@tanstack/react-table';
import AnalyticsDataTable from './AnalyticsDataTable';
import { Badge } from '@/components/ui/badge';
import { useTranslations } from 'next-intl';
import Link from 'next/link';

interface AssessmentOutliersTableProps {
  rows: AssessmentOutlierRow[];
  storageKey?: string;
  serverPaginated?: boolean;
}

type EnhancedAssessmentOutlierRow = AssessmentOutlierRow & {
  score_variance?: number | null;
  reliability_score?: number | null;
  discrimination_index?: number | null;
  suspicious_flag?: string | null;
};

export default function AssessmentOutliersTable({ rows, storageKey, serverPaginated }: AssessmentOutliersTableProps) {
  const t = useTranslations('TeacherAnalytics');
  const columns: ColumnDef<AssessmentOutlierRow>[] = [
    {
      accessorKey: 'title',
      header: t('assessmentOutliers.colAssessment'),
      cell: ({ row }) => (
        <div>
          <Link
            href={`/dash/analytics/assessments/${row.original.assessment_type}/${row.original.assessment_id}`}
            className="text-foreground focus-visible:ring-offset-background font-medium hover:text-emerald-700 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:outline-none dark:focus-visible:ring-offset-slate-900"
            aria-label={t('assessmentOutliers.viewAssessment', { title: row.original.title })}
          >
            {row.original.title}
          </Link>
          <div className="text-muted-foreground text-xs tracking-wide uppercase">
            {getAnalyticsAssessmentTypeLabel(t, row.original.assessment_type)}
          </div>
        </div>
      ),
    },
    { accessorKey: 'course_name', header: t('assessmentOutliers.colCourse') },
    {
      accessorKey: 'submission_rate',
      header: t('assessmentOutliers.colSubmission'),
      cell: ({ row }) => (row.original.submission_rate === null ? t('atRisk.na') : `${row.original.submission_rate}%`),
    },
    {
      accessorKey: 'pass_rate',
      header: t('assessmentOutliers.colPass'),
      cell: ({ row }) => (row.original.pass_rate === null ? t('atRisk.na') : `${row.original.pass_rate}%`),
    },
    {
      accessorKey: 'median_score',
      header: t('assessmentOutliers.colMedian'),
      cell: ({ row }) => (row.original.median_score === null ? t('atRisk.na') : `${row.original.median_score}%`),
    },
    {
      accessorKey: 'difficulty_score',
      header: t('assessmentOutliers.colDifficulty'),
      cell: ({ row }) => {
        const assessment = row.original as EnhancedAssessmentOutlierRow;
        const v = assessment.difficulty_score;
        if (v === null) return t('atRisk.na');
        // difficulty_score = round(100 - pass_rate, 2) → already on a 0–100 scale.
        return (
          <div>
            <div>{Math.round(v ?? 0)}%</div>
            {assessment.discrimination_index !== null && assessment.discrimination_index !== undefined && (
              <div className="text-muted-foreground text-[11px]">D {assessment.discrimination_index}</div>
            )}
            {assessment.suspicious_flag && (
              <Badge
                variant="warning"
                className="mt-1"
              >
                {assessment.suspicious_flag.replaceAll('_', ' ')}
              </Badge>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: 'outlier_reason_codes',
      header: t('assessmentOutliers.colSignals'),
      cell: ({ row }) =>
        row.original.outlier_reason_codes.filter((code): code is string => Boolean(code)).length ? (
          <div className="text-muted-foreground max-w-[240px] text-xs whitespace-normal">
            {row.original.outlier_reason_codes
              .filter((code): code is string => Boolean(code))
              .map((code) => (
                <Badge
                  key={code}
                  variant="outline"
                  className="mr-1 mb-1"
                >
                  {getAnalyticsReasonCodeLabel(t, code)}
                </Badge>
              ))}
          </div>
        ) : (
          t('assessmentOutliers.healthy')
        ),
    },
  ];

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle>{t('assessmentOutliers.title')}</CardTitle>
        <CardDescription>{t('assessmentOutliers.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <div
          className="sr-only"
          aria-live="polite"
        >
          {t('assessmentOutliers.rowCount', { count: rows.length })}
        </div>
        <AnalyticsDataTable
          columns={columns}
          data={rows}
          storageKey={storageKey}
          serverPaginated={serverPaginated}
          searchPlaceholder={t('assessmentOutliers.searchPlaceholder')}
          emptyMessage={t('assessmentOutliers.emptyMessage')}
        />
      </CardContent>
    </Card>
  );
}
