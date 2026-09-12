'use client'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { ForecastItem } from '@/types/analytics'
import { TrendingUp } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { getAnalyticsCodeLabel } from '@/lib/analytics/labels'

const FORECAST_KINDS = new Set([
  'completion_target_miss',
  'course_completion_deadline',
  'grading_backlog_7d',
  'assessment_failure_risk',
])

interface ForecastingPanelProps {
  forecasts: ForecastItem[]
}

export default function ForecastingPanel({ forecasts }: ForecastingPanelProps) {
  const t = useTranslations('Components.DashboardAnalytics')
  const tA = useTranslations('TeacherAnalytics')
  // The server templates English prose per `kind`; every value it interpolates
  // is also on the item, so the copy is rebuilt here from the catalog.
  const copy = (item: ForecastItem) => {
    if (!FORECAST_KINDS.has(item.kind)) return { title: getAnalyticsCodeLabel(tA, item.title), prediction: item.prediction }
    const values = {
      course: item.course_name ?? '',
      assessment: item.title.replace(/: [^:]*$/, ''),
      count: item.learner_count ?? 0,
      value: item.expected_value ?? 0,
    }
    return { title: tA(`forecast.${item.kind}.title`, values), prediction: tA(`forecast.${item.kind}.prediction`, values) }
  }
  const confidenceText = (level: string) =>
    t('forecastingPanel.confidenceLabel', {
      level: t(`forecastingPanel.confidenceLevels.${level}`),
    })

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <div className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          <CardTitle>{t('forecastingPanel.title')}</CardTitle>
        </div>
        <CardDescription>{t('forecastingPanel.description')}</CardDescription>
      </CardHeader>
      <CardContent className="divide-border/50 space-y-0 divide-y">
        {forecasts.slice(0, 8).map(item => (
          <div key={item.id} className="py-4 first:pt-0 last:pb-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge
                variant={
                  item.severity === 'critical' ? 'destructive' : item.severity === 'warning' ? 'warning' : 'outline'
                }
              >
                {t(`forecastingPanel.severity.${item.severity}`)}
              </Badge>
              <Badge variant="outline">{confidenceText(item.confidence_level)}</Badge>
            </div>
            <div className="text-foreground text-sm font-medium">{copy(item).title}</div>
            <div className="text-muted-foreground mt-1.5 text-xs leading-normal">{copy(item).prediction}</div>
          </div>
        ))}
        {!forecasts.length ? (
          <div className="text-muted-foreground py-4 text-center text-sm">{t('forecastingPanel.noForecastRisks')}</div>
        ) : null}
      </CardContent>
    </Card>
  )
}
