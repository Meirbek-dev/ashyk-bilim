'use client'

import { Suspense, lazy } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import type { AnalyticsQuery, TeacherOverviewResponse } from '@/types/analytics'

const TeacherWorkloadPanel = lazy(() => import('./TeacherWorkloadPanel'))
const DrillThroughAuditPanel = lazy(() => import('./DrillThroughAuditPanel'))
const AnomalyPanel = lazy(() => import('./AnomalyPanel'))
const DataQualityPanel = lazy(() => import('./DataQualityPanel'))
const ForecastingPanel = lazy(() => import('./ForecastingPanel'))

const SectionFallback = ({ height = 'h-[280px]' }: { height?: string }) => (
  <Card className="shadow-sm border-border bg-card">
    <CardContent className={`${height} bg-muted animate-pulse rounded-lg`} />
  </Card>
)

interface OperationsTabProps {
  query: AnalyticsQuery
  data: TeacherOverviewResponse
}

export default function OperationsTab({ query, data }: OperationsTabProps) {
  return (
    <div className="space-y-6">
      <Suspense fallback={<SectionFallback height="h-[420px]" />}>
        <TeacherWorkloadPanel workload={data.workload} />
      </Suspense>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <Suspense fallback={<SectionFallback height="h-[320px]" />}>
          <DrillThroughAuditPanel query={query} assessmentPreview={data.assessment_preview} />
        </Suspense>
        <Suspense fallback={<SectionFallback height="h-[320px]" />}>
          <AnomalyPanel anomalies={data.anomalies} />
        </Suspense>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <Suspense fallback={<SectionFallback height="h-[420px]" />}>
          <DataQualityPanel quality={data.data_quality} />
        </Suspense>
        <Suspense fallback={<SectionFallback height="h-[420px]" />}>
          <ForecastingPanel forecasts={data.forecasts} />
        </Suspense>
      </div>
    </div>
  )
}
