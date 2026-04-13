'use client';

import { getAnalyticsReasonCodeLabel, getAnalyticsRiskLevelLabel } from '@/lib/analytics/labels';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { AtRiskLearnerRow } from '@/types/analytics';
import type { ColumnDef } from '@tanstack/react-table';
import AnalyticsDataTable from './AnalyticsDataTable';
import { Badge } from '@/components/ui/badge';
import { useTranslations } from 'next-intl';
import Link from 'next/link';

interface AtRiskLearnersTableProps {
  title?: string;
  description?: string;
  rows: AtRiskLearnerRow[];
  storageKey?: string;
  serverPaginated?: boolean;
}

const riskVariant = (level: AtRiskLearnerRow['risk_level']) => {
  if (level === 'high') return 'destructive';
  if (level === 'medium') return 'warning';
  return 'outline';
};

export default function AtRiskLearnersTable({
  title,
  description,
  rows,
  storageKey,
  serverPaginated,
}: AtRiskLearnersTableProps) {
  const t = useTranslations('TeacherAnalytics');
  const resolvedTitle = title ?? t('atRisk.defaultTitle');
  const resolvedDescription = description ?? t('atRisk.defaultDescription');
  const columns: ColumnDef<AtRiskLearnerRow>[] = [
    {
      accessorKey: 'user_display_name',
      header: t('atRisk.colLearner'),
      cell: ({ row }) => {
        const courseHref = row.original.course_uuid ? `/dash/analytics/courses/${row.original.course_uuid}` : undefined;
        return (
          <div>
            <div className="text-foreground font-medium">{row.original.user_display_name}</div>
            <div className="text-muted-foreground text-xs">
              {t('atRisk.userNumber', { userId: row.original.user_id })}
            </div>
            {courseHref && (
              <Link
                href={courseHref}
                className="mt-0.5 block text-xs text-emerald-700 hover:underline"
              >
                {row.original.course_name}
              </Link>
            )}
          </div>
        );
      },
    },
    { accessorKey: 'course_name', header: t('atRisk.colCourse') },
    {
      accessorKey: 'progress_pct',
      header: t('atRisk.colProgress'),
      cell: ({ row }) => `${row.original.progress_pct}%`,
    },
    {
      accessorKey: 'days_since_last_activity',
      header: t('atRisk.colInactivity'),
      cell: ({ row }) =>
        row.original.days_since_last_activity === null ? t('atRisk.na') : `${row.original.days_since_last_activity}d`,
    },
    {
      accessorKey: 'risk_score',
      header: t('atRisk.colRisk'),
      cell: ({ row }) => {
        const c = row.original.risk_components;
        return (
          <div className="space-y-1">
            <Badge variant={riskVariant(row.original.risk_level)}>
              {getAnalyticsRiskLevelLabel(t, row.original.risk_level)} · {row.original.risk_score}
            </Badge>
            {/* Readable component breakdown replacing the old I/P/F/M/G abbreviations */}
            <div className="text-muted-foreground max-w-[280px] text-[11px] leading-4">
              {[
                [t('atRisk.riskComponents.inactivity'), c.inactivity],
                [t('atRisk.riskComponents.progress'), c.progress],
                [t('atRisk.riskComponents.failures'), c.failures],
                [t('atRisk.riskComponents.missing'), c.missing],
                [t('atRisk.riskComponents.grading'), c.grading],
              ]
                .filter(([, v]) => (v as number) > 0)
                .map(([label, v]) => `${label} ${Math.round(v as number)}`)
                .join(' · ')}
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: 'reason_codes',
      header: t('atRisk.colReasons'),
      cell: ({ row }) => (
        <div className="text-muted-foreground max-w-[220px] text-xs whitespace-normal">
          {row.original.reason_codes.map((code) => getAnalyticsReasonCodeLabel(t, code)).join(', ')}
        </div>
      ),
    },
    {
      accessorKey: 'recommended_action',
      header: t('atRisk.colAction'),
      cell: ({ row }) => {
        const hasGradingBlock = row.original.open_grading_blocks > 0;
        const gradingHref = row.original.course_uuid
          ? `/dash/analytics/courses/${row.original.course_uuid}`
          : '/dash/assignments';
        return (
          <div className="text-muted-foreground max-w-[280px] space-y-1 text-sm whitespace-normal">
            <span>{row.original.recommended_action}</span>
            {hasGradingBlock && gradingHref && (
              <Link
                href={gradingHref}
                className="block text-xs text-emerald-700 hover:underline"
              >
                {t('atRisk.gradeSubmissions', { count: row.original.open_grading_blocks })} →
              </Link>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle>{resolvedTitle}</CardTitle>
        <CardDescription>{resolvedDescription}</CardDescription>
      </CardHeader>
      <CardContent>
        <AnalyticsDataTable
          columns={columns}
          data={rows}
          storageKey={storageKey}
          serverPaginated={serverPaginated}
          searchPlaceholder={t('atRisk.searchPlaceholder')}
          emptyMessage={t('atRisk.emptyMessage')}
        />
      </CardContent>
    </Card>
  );
}
