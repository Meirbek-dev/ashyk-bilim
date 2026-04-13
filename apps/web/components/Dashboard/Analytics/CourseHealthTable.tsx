'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { TeacherCourseRow } from '@/types/analytics';
import type { ColumnDef } from '@tanstack/react-table';
import AnalyticsDataTable from './AnalyticsDataTable';
import { Badge } from '@/components/ui/badge';
import { useTranslations } from 'next-intl';
import Link from 'next/link';

interface CourseHealthTableProps {
  rows: TeacherCourseRow[];
  storageKey?: string;
  serverPaginated?: boolean;
}

export default function CourseHealthTable({ rows, storageKey, serverPaginated }: CourseHealthTableProps) {
  const t = useTranslations('TeacherAnalytics');
  const columns: ColumnDef<TeacherCourseRow>[] = [
    {
      accessorKey: 'course_name',
      header: t('courseHealth.colCourse'),
      cell: ({ row }) => (
        <Link
          href={`/dash/analytics/courses/${row.original.course_uuid}`}
          className="text-foreground font-medium hover:text-emerald-700"
        >
          {row.original.course_name}
        </Link>
      ),
    },
    { accessorKey: 'active_learners_7d', header: t('courseHealth.colActive7d') },
    {
      accessorKey: 'completion_rate',
      header: t('courseHealth.colCompletion'),
      cell: ({ row }) => `${row.original.completion_rate}%`,
    },
    { accessorKey: 'at_risk_learners', header: t('courseHealth.colRisk') },
    { accessorKey: 'ungraded_submissions', header: t('courseHealth.colUngraded') },
    {
      accessorKey: 'content_health_score',
      header: t('courseHealth.colHealth'),
      cell: ({ row }) => {
        const v = row.original.content_health_score;
        if (v === null) return t('atRisk.na');
        // Score is already on a 0–100 scale (freshness × 0.55 + avg_progress × 0.45).
        return `${Math.round(v)}%`;
      },
    },
    {
      accessorKey: 'top_alert',
      header: t('courseHealth.colTopAlert'),
      cell: ({ row }) =>
        row.original.top_alert ? (
          <Badge
            variant={
              row.original.top_alert.severity === 'critical'
                ? 'destructive'
                : row.original.top_alert.severity === 'warning'
                  ? 'warning'
                  : 'outline'
            }
          >
            {row.original.top_alert.title}
          </Badge>
        ) : (
          t('courseHealth.noAlert')
        ),
    },
  ];

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle>{t('courseHealth.title')}</CardTitle>
        <CardDescription>{t('courseHealth.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <AnalyticsDataTable
          columns={columns}
          data={rows}
          storageKey={storageKey}
          serverPaginated={serverPaginated}
          searchPlaceholder={t('courseHealth.searchPlaceholder')}
          emptyMessage={t('courseHealth.emptyMessage')}
        />
      </CardContent>
    </Card>
  );
}
