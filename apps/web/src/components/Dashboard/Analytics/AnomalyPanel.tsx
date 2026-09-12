'use client'

import { useTranslations } from 'next-intl'
import { getAnalyticsCodeLabel } from '@/lib/analytics/labels'

const ANOMALY_KINDS = new Set(['engagement_drop', 'submission_spike', 'fast_quiz_completion', 'score_distribution_shift'])
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { AnomalyItem } from '@/types/analytics'
import { Activity } from 'lucide-react'

interface AnomalyPanelProps {
  anomalies: AnomalyItem[]
}

export default function AnomalyPanel({ anomalies }: AnomalyPanelProps) {
  const t = useTranslations('Components.AnomalyPanel')
  const tA = useTranslations('TeacherAnalytics')
  // Server titles are `"{name}: <english>"` per kind; rebuild from the name.
  const title = (item: AnomalyItem) =>
    ANOMALY_KINDS.has(item.kind) ? tA(`anomaly.${item.kind}`, { name: item.title.replace(/: [^:]*$/, '') }) : item.title

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5" />
          <CardTitle>{t('title')}</CardTitle>
        </div>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent className="divide-border/50 space-y-0 divide-y">
        {anomalies.slice(0, 8).map(item => (
          <div key={item.id} className="py-4 first:pt-0 last:pb-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge
                variant={
                  item.severity === 'critical' ? 'destructive' : item.severity === 'warning' ? 'warning' : 'outline'
                }
              >
                {t(`severity.${item.severity}`)}
              </Badge>
              <span className="text-muted-foreground text-xs tracking-wider uppercase">
                {getAnalyticsCodeLabel(tA, item.kind)}
              </span>
            </div>
            <div className="text-foreground text-sm font-medium">{title(item)}</div>
            <div className="text-muted-foreground mt-1.5 text-xs leading-normal">{getAnalyticsCodeLabel(tA, item.detail)}</div>
          </div>
        ))}
        {!anomalies.length ? (
          <div className="text-muted-foreground py-4 text-center text-sm">{t('noAnomalies')}</div>
        ) : null}
      </CardContent>
    </Card>
  )
}
