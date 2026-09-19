'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { AnalyticsQuery, AssessmentOutlierRow, AssessmentType, DrillThroughResponse } from '@/types/analytics'
import { getTeacherDrillThrough } from '@services/analytics/teacher'
import { useApiError } from '@/hooks/useApiError'
import { getAnalyticsAssessmentTypeLabel, getAnalyticsStatusLabel } from '@/lib/analytics/labels'
import { fromUnix } from '@/lib/api/contract'
import { DATE_TIME_OPTIONS, formatDate } from '@/lib/date'
import { ListFilter, Search } from 'lucide-react'
import { useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'

interface DrillThroughAuditPanelProps {
  query: AnalyticsQuery
  assessmentPreview: AssessmentOutlierRow[]
}

type ColumnKind = 'text' | 'number' | 'percent' | 'steps' | 'bool' | 'unix' | 'status' | 'assessmentType'
type Column = { key: string; label: string; kind: ColumnKind }
const col = (key: string, label: string, kind: ColumnKind = 'text'): Column => ({ key, label, kind })

/**
 * Curated columns per metric (UX-122) — the rows are untyped `Object`s on the
 * wire (`drillthrough.rs` / `workload.rs`), so the shape is pinned here.
 */
const learnerColumns = [
  col('user_display_name', 'learner'),
  col('course_name', 'course'),
  col('progress_pct', 'progress', 'percent'),
  col('completed_steps', 'steps', 'steps'),
  col('is_completed', 'completed', 'bool'),
  col('last_activity_at_unix', 'lastActivity', 'unix'),
]
export const DRILL_THROUGH_COLUMNS: Record<DrillThroughResponse['metric'], Column[]> = {
  active_learners: learnerColumns,
  completion_rate: learnerColumns,
  backlog: [
    col('user_display_name', 'learner'),
    col('course_name', 'course'),
    col('assessment_title', 'assessment'),
    col('assessment_type', 'assessmentType', 'assessmentType'),
    col('status', 'status', 'status'),
    col('submitted_at_unix', 'submitted', 'unix'),
    col('age_hours', 'ageHours', 'number'),
    col('sla_breached', 'slaBreached', 'bool'),
  ],
  pass_rate: [
    col('user_display_name', 'learner'),
    col('attempts', 'attempts', 'number'),
    col('best_score', 'bestScore', 'number'),
    col('last_score', 'lastScore', 'number'),
    col('status', 'status', 'status'),
    col('submitted_at_unix', 'submitted', 'unix'),
    col('graded_at_unix', 'gradedAt', 'unix'),
    col('passed', 'passed', 'bool'),
  ],
}

export default function DrillThroughAuditPanel({ query, assessmentPreview }: DrillThroughAuditPanelProps) {
  const t = useTranslations('Components.DashboardAnalytics')
  const tA = useTranslations('TeacherAnalytics')
  const locale = useLocale()
  const { toastApiError } = useApiError()
  const [result, setResult] = useState<DrillThroughResponse | null>(null)
  const [loadingMetric, setLoadingMetric] = useState<DrillThroughResponse['metric'] | null>(null)
  const assessment = assessmentPreview.find(item => item.pass_rate !== null) ?? assessmentPreview[0]

  const displayValue = (row: Record<string, unknown>, column: Column) => {
    const value = row[column.key]
    if (value === null || value === undefined || value === '') return t('drillThroughAuditPanel.na')
    switch (column.kind) {
      case 'bool':
        return value ? t('drillThroughAuditPanel.yes') : t('drillThroughAuditPanel.no')
      case 'unix':
        return typeof value === 'number' ? formatDate(fromUnix(value), locale, DATE_TIME_OPTIONS) : String(value)
      case 'percent':
        return `${value}%`
      case 'steps':
        return `${value} / ${row['total_steps'] ?? t('drillThroughAuditPanel.na')}`
      case 'status':
        return getAnalyticsStatusLabel(tA, String(value))
      case 'assessmentType':
        return getAnalyticsAssessmentTypeLabel(tA, String(value) as AssessmentType)
      default:
        return String(value)
    }
  }

  const metricLabel = (metric: string) => {
    const labels: Record<string, string> = {
      active_learners: t('drillThroughAuditPanel.metrics.active_learners'),
      completion_rate: t('drillThroughAuditPanel.metrics.completion_rate'),
      backlog: t('drillThroughAuditPanel.metrics.backlog'),
      pass_rate: t('drillThroughAuditPanel.metrics.pass_rate'),
    }

    return labels[metric] ?? metric.replaceAll('_', ' ')
  }

  const loadMetric = async (metric: DrillThroughResponse['metric']) => {
    setLoadingMetric(metric)
    try {
      const response = await getTeacherDrillThrough(
        metric,
        metric === 'pass_rate' && assessment
          ? {
              ...query,
              assessment_type: assessment.assessment_type,
              assessment_id: assessment.assessment_id,
            }
          : query,
      )
      setResult(response)
    } catch (error) {
      toastApiError(error, { fallback: t('drillThroughAuditPanel.couldNotLoadRows') })
    } finally {
      setLoadingMetric(null)
    }
  }

  const resultItems = result?.items ?? []
  const columns = result ? DRILL_THROUGH_COLUMNS[result.metric] : []

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <div className="flex items-center gap-2">
          <ListFilter className="h-5 w-5" />
          <CardTitle>{t('drillThroughAuditPanel.title')}</CardTitle>
        </div>
        <CardDescription>{t('drillThroughAuditPanel.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {(['active_learners', 'completion_rate', 'backlog'] as const).map(metric => (
            <Button
              key={metric}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => loadMetric(metric)}
              disabled={loadingMetric !== null}
            >
              <Search className="h-3.5 w-3.5" />
              {metricLabel(metric)}
            </Button>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => loadMetric('pass_rate')}
            disabled={loadingMetric !== null || !assessment}
          >
            <Search className="h-3.5 w-3.5" />
            {t('drillThroughAuditPanel.metrics.pass_rate')}
          </Button>
        </div>

        {result ? (
          <div className="space-y-2">
            <Badge variant="outline">
              {metricLabel(result.metric)}: {t('drillThroughAuditPanel.rows', { count: result.total ?? 0 })}
            </Badge>
            <Table>
              <TableHeader>
                <TableRow>
                  {columns.map(column => (
                    <TableHead key={column.key}>{t(`drillThroughAuditPanel.columns.${column.label}`)}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {resultItems.slice(0, 8).map((item, index) => (
                  <TableRow key={`${result.metric}-${index}`}>
                    {columns.map(column => (
                      <TableCell key={column.key} className="max-w-[220px] truncate">
                        {displayValue(item, column)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
                {!resultItems.length ? (
                  <TableRow>
                    <TableCell colSpan={Math.max(columns.length, 1)} className="text-muted-foreground">
                      {t('drillThroughAuditPanel.noSourceRows')}
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="text-muted-foreground text-sm">{t('drillThroughAuditPanel.chooseMetric')}</div>
        )}
      </CardContent>
    </Card>
  )
}
