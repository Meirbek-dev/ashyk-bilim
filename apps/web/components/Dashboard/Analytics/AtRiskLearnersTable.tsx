'use client';

import { getAnalyticsReasonCodeLabel, getAnalyticsRiskLevelLabel } from '@/lib/analytics/labels';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { AnalyticsQuery, AtRiskLearnerRow } from '@/types/analytics';
import { createTeacherIntervention } from '@services/analytics/teacher';
import type { ColumnDef } from '@tanstack/react-table';
import AnalyticsDataTable from './AnalyticsDataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';

interface AtRiskLearnersTableProps {
  title?: string;
  description?: string;
  rows: AtRiskLearnerRow[];
  storageKey?: string;
  serverPaginated?: boolean;
  query?: AnalyticsQuery;
}

type EnhancedAtRiskLearnerRow = AtRiskLearnerRow & {
  risk_trend?: 'newly_at_risk' | 'worsening' | 'improving' | 'recovered' | 'stable';
  previous_risk_score?: number | null;
  risk_score_delta?: number | null;
  top_contributing_factor?: string | null;
  confidence_level?: 'low' | 'medium' | 'high';
  why_now?: string | null;
  intervention_count?: number;
  last_intervention_type?: string | null;
  last_intervention_at?: string | null;
  last_intervention_outcome?: string | null;
};

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
  query,
}: AtRiskLearnersTableProps) {
  const t = useTranslations('TeacherAnalytics');
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const resolvedTitle = title ?? t('atRisk.defaultTitle');
  const resolvedDescription = description ?? t('atRisk.defaultDescription');
  const logIntervention = async (
    row: EnhancedAtRiskLearnerRow,
    interventionType: 'message_sent' | 'meeting_scheduled' | 'learner_recovered',
  ) => {
    const key = `${row.course_id}:${row.user_id}:${interventionType}`;
    setPendingKey(key);
    try {
      await createTeacherIntervention(
        {
          user_id: row.user_id,
          course_id: row.course_id,
          intervention_type: interventionType,
          status: interventionType === 'learner_recovered' ? 'resolved' : 'completed',
          outcome: interventionType === 'learner_recovered' ? 'Recovered from risk' : null,
        },
        query,
      );
      toast.success('Intervention logged');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to log intervention');
    } finally {
      setPendingKey(null);
    }
  };
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
        const riskRow = row.original as EnhancedAtRiskLearnerRow;
        const c = riskRow.risk_components;
        return (
          <div className="space-y-1">
            <Badge variant={riskVariant(riskRow.risk_level)}>
              {getAnalyticsRiskLevelLabel(t, riskRow.risk_level)} · {riskRow.risk_score}
            </Badge>
            {riskRow.risk_trend && riskRow.risk_trend !== 'stable' && (
              <div className="text-muted-foreground text-[11px]">
                {riskRow.risk_trend.replaceAll('_', ' ')}
                {riskRow.risk_score_delta !== null && riskRow.risk_score_delta !== undefined
                  ? ` (${riskRow.risk_score_delta > 0 ? '+' : ''}${riskRow.risk_score_delta})`
                  : ''}
              </div>
            )}
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
          {(row.original as EnhancedAtRiskLearnerRow).why_now && (
            <div className="mt-1 text-[11px]">{(row.original as EnhancedAtRiskLearnerRow).why_now}</div>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'recommended_action',
      header: t('atRisk.colAction'),
      cell: ({ row }) => {
        const riskRow = row.original as EnhancedAtRiskLearnerRow;
        const hasGradingBlock = riskRow.open_grading_blocks > 0;
        const gradingHref = riskRow.course_uuid
          ? `/dash/analytics/courses/${riskRow.course_uuid}`
          : '/dash/courses';
        return (
          <div className="text-muted-foreground max-w-[280px] space-y-1 text-sm whitespace-normal">
            <span>{riskRow.recommended_action}</span>
            <div className="text-[11px]">
              {riskRow.intervention_count
                ? `${riskRow.intervention_count} interventions logged`
                : 'No interventions logged'}
            </div>
            {hasGradingBlock && gradingHref && (
              <Link
                href={gradingHref}
                className="block text-xs text-emerald-700 hover:underline"
              >
                {t('atRisk.gradeSubmissions', { count: riskRow.open_grading_blocks })} →
              </Link>
            )}
            <div className="flex flex-wrap gap-1 pt-1">
              {[
                ['message_sent', 'Message'],
                ['meeting_scheduled', 'Meeting'],
                ['learner_recovered', 'Recovered'],
              ].map(([type, label]) => {
                const key = `${riskRow.course_id}:${riskRow.user_id}:${type}`;
                return (
                  <Button
                    key={type}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    disabled={pendingKey === key}
                    onClick={() =>
                      logIntervention(riskRow, type as 'message_sent' | 'meeting_scheduled' | 'learner_recovered')
                    }
                  >
                    {label}
                  </Button>
                );
              })}
            </div>
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
