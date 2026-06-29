'use client'

import { Suspense, lazy } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { getAnalyticsSeverityLabel } from '@/lib/analytics/labels'
import type { AnalyticsQuery, TeacherOverviewResponse } from '@/types/analytics'
import { useLocale, useTranslations } from 'next-intl'
import { Badge } from '@/components/ui/badge'
import { useRouter } from 'next/navigation'
import { Link } from '@/i18n/navigation'
import { AlertCircle, Activity } from 'lucide-react'

const AnalyticsMultiSeriesTrendChart = lazy(() => import('./AnalyticsMultiSeriesTrendChart'))
const GradingBacklogPanel = lazy(() => import('./GradingBacklogPanel'))
const TeacherKpiCharts = lazy(() => import('./TeacherKpiCharts'))
const TeacherKpiCards = lazy(() => import('./TeacherKpiCards'))

const SectionFallback = ({ height = 'h-[280px]' }: { height?: string }) => (
  <Card className="border-border bg-card shadow-sm">
    <CardContent className={`${height} bg-muted animate-pulse rounded-lg`} />
  </Card>
)

interface OverviewTabProps {
  query: AnalyticsQuery
  data: TeacherOverviewResponse
}

export default function OverviewTab({ query, data }: OverviewTabProps) {
  const t = useTranslations('TeacherAnalytics')
  const locale = useLocale()
  const router = useRouter()

  const resolveAlertHref = (href?: string | null) => {
    if (!href) return undefined
    return href
  }

  function formatFreshness(seconds: number): string {
    if (seconds <= 0) return t('freshness.live')
    if (seconds < 60) return t('freshness.seconds', { seconds })
    if (seconds < 3600) return t('freshness.minutes', { minutes: Math.round(seconds / 60) })
    if (seconds < 86_400) return t('freshness.hours', { hours: Math.round(seconds / 3600) })
    return t('freshness.days', { days: Math.round(seconds / 86_400) })
  }

  // Align trend series by the union of bucket timestamps so sparse series are not dropped.
  const allBuckets = [
    ...new Set([
      ...data.trends.active_learners.map(point => point.bucket_start),
      ...data.trends.completions.map(point => point.bucket_start),
      ...data.trends.submissions.map(point => point.bucket_start),
      ...data.trends.grading_completed.map(point => point.bucket_start),
    ]),
  ].toSorted()
  const completionsMap = new Map(data.trends.completions.map(p => [p.bucket_start, p.value]))
  const submissionsMap = new Map(data.trends.submissions.map(p => [p.bucket_start, p.value]))
  const gradingMap = new Map(data.trends.grading_completed.map(p => [p.bucket_start, p.value]))
  const activeMap = new Map(data.trends.active_learners.map(p => [p.bucket_start, p.value]))
  const trendData = allBuckets.map(bucketStart => ({
    bucket_start: bucketStart,
    bucket: new Date(bucketStart).toLocaleDateString(locale, {
      month: 'short',
      day: 'numeric',
    }),
    active_learners: activeMap.get(bucketStart) ?? 0,
    completions: completionsMap.get(bucketStart) ?? 0,
    submissions: submissionsMap.get(bucketStart) ?? 0,
    grading_completed: gradingMap.get(bucketStart) ?? 0,
  }))

  const kpiCards = [
    {
      metric: data.summary.active_learners,
      sparkline: data.trends.active_learners.map(p => p.value),
      definition: t('kpi.definitions.activeLearners'),
    },
    {
      metric: data.summary.returning_learners,
      sparkline: [] as number[],
      definition: t('kpi.definitions.returningLearners'),
    },
    {
      metric: data.summary.completion_rate,
      sparkline: data.trends.completions.map(p => p.value),
      definition: t('kpi.definitions.completionRate'),
    },
    {
      metric: data.summary.at_risk_learners,
      sparkline: [] as number[],
      definition: t('kpi.definitions.atRisk'),
    },
    {
      metric: data.summary.ungraded_submissions,
      sparkline: [] as number[],
      definition: t('kpi.definitions.ungradedSubmissions'),
    },
    {
      metric: data.summary.negative_engagement_courses,
      sparkline: [] as number[],
      definition: t('kpi.definitions.negativeCourses'),
    },
  ]

  const handleTrendClick = (
    bucketStart: string,
    row?: {
      active_learners: number
      submissions: number
      grading_completed: number
    },
  ) => {
    const params = new URLSearchParams()
    if (query.window) params.set('window', query.window)
    if (query.compare) params.set('compare', query.compare)
    if (query.bucket) params.set('bucket', query.bucket)
    if (query.course_ids) params.set('course_ids', query.course_ids)
    if (query.cohort_ids) params.set('cohort_ids', query.cohort_ids)
    if (query.timezone) params.set('timezone', query.timezone)
    params.set('bucket_start', bucketStart)

    const isSubmissionDominant = row && row.submissions + row.grading_completed >= row.active_learners
    if (isSubmissionDominant) {
      params.set('sort_by', 'signals')
      router.push(`/dash/analytics/assessments?${params.toString()}`)
    } else {
      router.push(`/dash/analytics/courses?${params.toString()}`)
    }
  }

  return (
    <div className="space-y-6">
      <Suspense fallback={<SectionFallback height="h-[220px]" />}>
        <TeacherKpiCards cards={kpiCards} />
      </Suspense>

      <Suspense fallback={<SectionFallback height="h-[420px]" />}>
        <TeacherKpiCharts metrics={data.summary} trends={data.trends} />
      </Suspense>

      <div className="grid gap-6 xl:grid-cols-[1.7fr_1fr]">
        <Suspense fallback={<SectionFallback height="h-[360px]" />}>
          <AnalyticsMultiSeriesTrendChart
            title={t('overview.trendTitle')}
            description={t('overview.trendDescription')}
            data={trendData}
            onBucketClick={handleTrendClick}
          />
        </Suspense>
        <Suspense fallback={<SectionFallback height="h-[220px]" />}>
          <GradingBacklogPanel backlogCount={data.summary.ungraded_submissions.value} alerts={data.alerts} />
        </Suspense>
      </div>

      {/* Alerts and Provenance */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Modern Alerts Card */}
        <Card className="border-border bg-card flex flex-col justify-between">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="text-destructive h-5 w-5" />
              <CardTitle>{t('overview.alertsTitle')}</CardTitle>
            </div>
            <CardDescription>{t('overview.alertsDescription')}</CardDescription>
          </CardHeader>
          <CardContent className="flex-1">
            <div className="flex flex-col gap-3">
              {data.alerts.length ? (
                data.alerts.map(alert => {
                  const alertHref = resolveAlertHref(alert.href)
                  const alertCardContent = (
                    <div className="flex items-start gap-3">
                      <Badge
                        variant={
                          alert.severity === 'critical'
                            ? 'destructive'
                            : alert.severity === 'warning'
                              ? 'warning'
                              : 'outline'
                        }
                        className="mt-0.5 shrink-0"
                      >
                        {getAnalyticsSeverityLabel(t, alert.severity)}
                      </Badge>
                      <div className="min-w-0 flex-1">
                        <div className="text-foreground text-sm font-semibold">{alert.title}</div>
                        <div className="text-muted-foreground mt-1 text-xs leading-relaxed">{alert.body}</div>
                      </div>
                    </div>
                  )

                  if (alertHref) {
                    return (
                      <Link
                        key={alert.id}
                        href={alertHref}
                        className="bg-muted/30 hover:bg-muted/60 border-border/50 block rounded-md border px-4 py-3 transition-colors"
                      >
                        {alertCardContent}
                      </Link>
                    )
                  }

                  return (
                    <div key={alert.id} className="bg-muted/30 border-border/50 rounded-md border px-4 py-3">
                      {alertCardContent}
                    </div>
                  )
                })
              ) : (
                <div className="text-muted-foreground py-8 text-center text-sm">{t('overview.alertsEmpty')}</div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Data Provenance & Scope Card */}
        <Card className="border-border bg-card flex flex-col">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Activity className="text-primary h-5 w-5" />
              <CardTitle>{t('overview.freshnessTitle')}</CardTitle>
            </div>
            <CardDescription>{t('overview.freshnessDescription')}</CardDescription>
          </CardHeader>
          <CardContent className="grid flex-1 gap-3 sm:grid-cols-2">
            <div className="bg-muted/30 hover:bg-muted/50 border-border/50 flex flex-col justify-between rounded-md border px-4 py-3 transition-colors">
              <div className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
                {t('overview.labelGenerated')}
              </div>
              <div className="text-foreground mt-2 truncate text-sm font-semibold">
                {new Date(data.generated_at).toLocaleString(locale)}
              </div>
            </div>
            <div className="bg-muted/30 hover:bg-muted/50 border-border/50 flex flex-col justify-between rounded-md border px-4 py-3 transition-colors">
              <div className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
                {t('overview.labelFreshness')}
              </div>
              <div className="text-foreground mt-2 text-sm font-semibold">
                {formatFreshness(data.freshness_seconds)}
              </div>
            </div>
            <div className="bg-muted/30 hover:bg-muted/50 border-border/50 flex flex-col justify-between rounded-md border px-4 py-3 transition-colors">
              <div className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
                {t('overview.labelScopedCourses')}
              </div>
              <div className="text-foreground mt-2 text-lg font-bold">{data.scope.course_ids.length}</div>
            </div>
            <div className="bg-muted/30 hover:bg-muted/50 border-border/50 flex flex-col justify-between rounded-md border px-4 py-3 transition-colors">
              <div className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
                {t('overview.labelCohorts')}
              </div>
              <div className="text-foreground mt-2 text-sm font-semibold">
                {data.scope.cohort_ids.length || t('overview.cohortsAll')}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
