'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { getAnalyticsSeverityLabel } from '@/lib/analytics/labels'
import type {
  AdminAnalyticsResponse,
  AnalyticsFilterOption,
  AnalyticsQuery,
  TeacherOverviewResponse,
} from '@/types/analytics'
import { getAnalyticsExportUrl } from '@services/analytics/teacher'
import AnalyticsExportButton from './AnalyticsExportButton'
import { useLocale, useTranslations } from 'next-intl'
import TeacherFilterBar from './TeacherFilterBar'
import { Badge } from '@/components/ui/badge'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Suspense, lazy } from 'react'
import { Link } from '@/i18n/navigation'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  LayoutDashboard,
  Users,
  Award,
  Clock,
  ShieldCheck,
  AlertCircle,
  Activity,
  Zap
} from 'lucide-react'

const AnalyticsRiskDistributionChart = lazy(() => import('./AnalyticsRiskDistributionChart'))
const AnalyticsMultiSeriesTrendChart = lazy(() => import('./AnalyticsMultiSeriesTrendChart'))
const AdminAnalyticsPanel = lazy(() => import('./AdminAnalyticsPanel'))
const AnomalyPanel = lazy(() => import('./AnomalyPanel'))
const AssessmentOutliersTable = lazy(() => import('./AssessmentOutliersTable'))
const ContentBottlenecksTable = lazy(() => import('./ContentBottlenecksTable'))
const DataQualityPanel = lazy(() => import('./DataQualityPanel'))
const DrillThroughAuditPanel = lazy(() => import('./DrillThroughAuditPanel'))
const ForecastingPanel = lazy(() => import('./ForecastingPanel'))
const GradingBacklogPanel = lazy(() => import('./GradingBacklogPanel'))
const SavedViewsBar = lazy(() => import('./SavedViewsBar'))
const AtRiskLearnersTable = lazy(() => import('./AtRiskLearnersTable'))
const CourseHealthTable = lazy(() => import('./CourseHealthTable'))
const TeacherWorkloadPanel = lazy(() => import('./TeacherWorkloadPanel'))
const TeacherKpiCharts = lazy(() => import('./TeacherKpiCharts'))
const TeacherKpiCards = lazy(() => import('./TeacherKpiCards'))

const SectionFallback = ({ height = 'h-[280px]' }: { height?: string }) => (
  <Card className="shadow-sm">
    <CardContent className={`${height} bg-muted animate-pulse rounded-lg`} />
  </Card>
)

interface TeacherOverviewProps {
  query: AnalyticsQuery
  data: TeacherOverviewResponse
  adminData?: AdminAnalyticsResponse | null
  courseOptions?: AnalyticsFilterOption[]
  cohortOptions?: AnalyticsFilterOption[]
}

const EMPTY_FILTER_OPTIONS: AnalyticsFilterOption[] = []

export default function TeacherOverview({
  query,
  data,
  adminData,
  courseOptions = EMPTY_FILTER_OPTIONS,
  cohortOptions = EMPTY_FILTER_OPTIONS,
}: TeacherOverviewProps) {
  const t = useTranslations('TeacherAnalytics')
  const locale = useLocale()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const activeTab = searchParams.get('tab') || 'overview'

  const handleTabChange = (newTab: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', newTab)
    router.push(`${pathname}?${params.toString()}`, { scroll: false })
  }

  const interventionSummary = (
    data as TeacherOverviewResponse & {
      intervention_summary?: {
        total: number
        open: number
        resolved: number
        recovered_learners: number
        avg_risk_delta_after_intervention: number | null
      }
    }
  ).intervention_summary

  const buildScopedHref = (pathname: string, overrides: Partial<AnalyticsQuery> = {}) => {
    const params = new URLSearchParams()
    const scopedQuery = { ...query, ...overrides }
    if (scopedQuery.window) params.set('window', scopedQuery.window)
    if (scopedQuery.compare) params.set('compare', scopedQuery.compare)
    if (scopedQuery.bucket) params.set('bucket', scopedQuery.bucket)
    if (scopedQuery.course_ids) params.set('course_ids', scopedQuery.course_ids)
    if (scopedQuery.cohort_ids) params.set('cohort_ids', scopedQuery.cohort_ids)
    if (scopedQuery.teacher_user_id) params.set('teacher_user_id', String(scopedQuery.teacher_user_id))
    if (scopedQuery.timezone) params.set('timezone', scopedQuery.timezone)
    if (scopedQuery.bucket_start) params.set('bucket_start', scopedQuery.bucket_start)
    if (scopedQuery.sort_by) params.set('sort_by', scopedQuery.sort_by)
    if (scopedQuery.sort_order) params.set('sort_order', scopedQuery.sort_order)
    const serialized = params.toString()
    return serialized ? `${pathname}?${serialized}` : pathname
  }

  const resolveAlertHref = (href?: string | null) => {
    if (!href) {
      return undefined
    }
    if (href.startsWith('/dash/analytics/')) {
      return href
    }
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

  // Build KPI cards with correct trend series.
  // Only active_learners has a true per-bucket time-series trend to display.
  // For all other metrics, pass an empty sparkline so the card renders cleanly without
  // a misleading proxy line (issue 2). Definitions are added for `returning_learners`,
  // `at_risk`, `content_health`, and `difficulty` (issue 3).
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
      // Completions count correlates directionally with the rate; explicitly labelled below.
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

  // Context-aware chart click: if submissions > active_learners in the clicked bucket,
  // route to the filtered assessment list; otherwise route to the course health list (issue 14).
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
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-6 px-4 py-6 md:px-6 xl:px-8">
      {/* Clean, Premium Page Header */}
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between border-b border-border/40 pb-6 mb-2">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="border-primary/20 bg-primary/5 text-primary text-xs font-semibold uppercase tracking-wider">
              {t('overview.label')}
            </Badge>
            <span className="text-muted-foreground text-xs">•</span>
            <span className="text-muted-foreground text-xs font-medium">
              {t('overview.labelScopedCourses')}: {data.scope.course_ids.length}
            </span>
          </div>
          <h1 className="text-foreground mt-4 text-3xl font-extrabold tracking-tight md:text-4xl">
            Teacher Analytics &amp; Operations
          </h1>
          <p className="text-muted-foreground mt-2 max-w-3xl text-sm leading-relaxed md:text-base font-normal">
            {t('overview.heading')}
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <AnalyticsExportButton href={getAnalyticsExportUrl('at-risk', query)} label={t('overview.exportAtRisk')} />
          <AnalyticsExportButton
            href={getAnalyticsExportUrl('grading-backlog', query)}
            label={t('overview.exportGradingBacklog')}
          />
        </div>
      </div>

      {/* Global Filters Section (Above Tabs) */}
      <div className="w-full">
        <TeacherFilterBar
          query={query}
          courseCount={data.scope.course_ids.length}
          courseOptions={(courseOptions.length ? courseOptions : data.course_options) ?? []}
          cohortOptions={(cohortOptions.length ? cohortOptions : data.cohort_options) ?? []}
        />
        <Suspense fallback={<SectionFallback height="h-[36px]" />}>
          <SavedViewsBar query={query} />
        </Suspense>
      </div>

      {/* Modern Dashboard Switcher */}
      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="border-b border-border/45 w-full flex items-center justify-start gap-6 bg-transparent rounded-none p-0 h-auto mb-6">
          <TabsTrigger value="overview" className="relative h-10 px-1 pb-3 text-sm font-medium text-muted-foreground data-active:text-foreground data-active:border-b-2 data-active:border-primary rounded-none shadow-none bg-transparent hover:text-foreground flex items-center gap-2">
            <LayoutDashboard className="h-4 w-4" />
            <span>{t('tabs.overview')}</span>
            {data.alerts.length > 0 && (
              <span className="ml-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive/10 text-destructive border border-destructive/20 text-[10px] font-bold px-1.5 py-0.5">
                {data.alerts.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="watchlist" className="relative h-10 px-1 pb-3 text-sm font-medium text-muted-foreground data-active:text-foreground data-active:border-b-2 data-active:border-primary rounded-none shadow-none bg-transparent hover:text-foreground flex items-center gap-2">
            <Users className="h-4 w-4" />
            <span>{t('tabs.watchlist')}</span>
            {data.summary.at_risk_learners.value > 0 && (
              <span className="ml-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 text-[10px] font-bold px-1.5 py-0.5">
                {data.summary.at_risk_learners.value}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="performance" className="relative h-10 px-1 pb-3 text-sm font-medium text-muted-foreground data-active:text-foreground data-active:border-b-2 data-active:border-primary rounded-none shadow-none bg-transparent hover:text-foreground flex items-center gap-2">
            <Award className="h-4 w-4" />
            <span>{t('tabs.performance')}</span>
          </TabsTrigger>
          <TabsTrigger value="operations" className="relative h-10 px-1 pb-3 text-sm font-medium text-muted-foreground data-active:text-foreground data-active:border-b-2 data-active:border-primary rounded-none shadow-none bg-transparent hover:text-foreground flex items-center gap-2">
            <Clock className="h-4 w-4" />
            <span>{t('tabs.operations')}</span>
          </TabsTrigger>
          {adminData && (
            <TabsTrigger value="admin" className="relative h-10 px-1 pb-3 text-sm font-medium text-muted-foreground data-active:text-foreground data-active:border-b-2 data-active:border-primary rounded-none shadow-none bg-transparent hover:text-foreground flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-500" />
              <span>{t('tabs.admin')}</span>
            </TabsTrigger>
          )}
        </TabsList>

        {/* Tab Panel contents */}
        <div className="mt-4 space-y-6">
          {/* Tab 1: Overview */}
          <TabsContent value="overview" className="space-y-6 outline-none">
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
              <Card className="shadow-sm border-border bg-card/65 backdrop-blur-xs flex flex-col justify-between">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-5 w-5 text-destructive" />
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
                              <div className="text-foreground font-semibold text-sm">{alert.title}</div>
                              <div className="text-muted-foreground mt-1 text-xs leading-relaxed">{alert.body}</div>
                            </div>
                          </div>
                        )

                        if (alertHref) {
                          return (
                            <Link
                              key={alert.id}
                              href={alertHref}
                              className="bg-muted/40 hover:bg-muted/70 rounded-xl border border-border/50 p-4 transition-all hover:translate-x-0.5"
                            >
                              {alertCardContent}
                            </Link>
                          )
                        }

                        return (
                          <div key={alert.id} className="bg-muted/40 rounded-xl border border-border/50 p-4">
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
              <Card className="shadow-sm border-border bg-card/65 backdrop-blur-xs flex flex-col">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <Activity className="h-5 w-5 text-primary" />
                    <CardTitle>{t('overview.freshnessTitle')}</CardTitle>
                  </div>
                  <CardDescription>{t('overview.freshnessDescription')}</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-2 flex-1">
                  <div className="bg-muted/40 hover:bg-muted/65 transition-colors rounded-xl border border-border/50 p-4 flex flex-col justify-between">
                    <div className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
                      {t('overview.labelGenerated')}
                    </div>
                    <div className="text-foreground mt-2 text-sm font-semibold truncate">
                      {new Date(data.generated_at).toLocaleString(locale)}
                    </div>
                  </div>
                  <div className="bg-muted/40 hover:bg-muted/65 transition-colors rounded-xl border border-border/50 p-4 flex flex-col justify-between">
                    <div className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
                      {t('overview.labelFreshness')}
                    </div>
                    <div className="text-foreground mt-2 text-sm font-semibold">
                      {formatFreshness(data.freshness_seconds)}
                    </div>
                  </div>
                  <div className="bg-muted/40 hover:bg-muted/65 transition-colors rounded-xl border border-border/50 p-4 flex flex-col justify-between">
                    <div className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
                      {t('overview.labelScopedCourses')}
                    </div>
                    <div className="text-foreground mt-2 text-lg font-bold">{data.scope.course_ids.length}</div>
                  </div>
                  <div className="bg-muted/40 hover:bg-muted/65 transition-colors rounded-xl border border-border/50 p-4 flex flex-col justify-between">
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
          </TabsContent>

          {/* Tab 2: Student Watchlist */}
          <TabsContent value="watchlist" className="space-y-6 outline-none">
            {interventionSummary && (
              <Card className="shadow-sm border-border bg-card/65 backdrop-blur-xs">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <Zap className="h-5 w-5 text-amber-500" />
                    <CardTitle>{t('overview.interventionTitle')}</CardTitle>
                  </div>
                  <CardDescription>{t('overview.interventionDescription')}</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {[
                    [t('overview.interventionSummary.logged'), interventionSummary.total, 'border-slate-200 dark:border-slate-800'],
                    [t('overview.interventionSummary.open'), interventionSummary.open, 'border-amber-200 dark:border-amber-900 bg-amber-500/5'],
                    [t('overview.interventionSummary.resolved'), interventionSummary.resolved, 'border-emerald-200 dark:border-emerald-900 bg-emerald-500/5'],
                    [t('overview.interventionSummary.recovered'), interventionSummary.recovered_learners, 'border-blue-200 dark:border-blue-900 bg-blue-500/5'],
                  ].map(([label, value, borderClass]) => (
                    <div key={String(label)} className={`rounded-xl border p-4 flex flex-col justify-between ${borderClass}`}>
                      <div className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">{String(label)}</div>
                      <div className="text-foreground mt-3 text-3xl font-extrabold">{Number(value)}</div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            <div className="grid gap-6 xl:grid-cols-[1fr_2.2fr]">
              <Suspense fallback={<SectionFallback height="h-[360px]" />}>
                <AnalyticsRiskDistributionChart
                  counts={data.risk_distribution}
                  totalAtRisk={data.summary.at_risk_learners.value}
                />
              </Suspense>

              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-2 pl-1">
                  <Badge variant="outline" className="text-xs font-semibold">
                    {t('overview.previewLabel')}
                  </Badge>
                  <span className="text-muted-foreground text-xs">
                    {t('riskDistribution.preview', {
                      shown: data.at_risk_preview.length,
                      total: data.at_risk_total,
                    })}
                  </span>
                </div>
                <Suspense fallback={<SectionFallback height="h-[360px]" />}>
                  <AtRiskLearnersTable
                    rows={data.at_risk_preview}
                    title={t('overview.watchlistTitle')}
                    description={t('overview.watchlistDescription')}
                    storageKey="overview-risk"
                    query={query}
                  />
                </Suspense>
                {data.at_risk_total > 0 && (
                  <p className="text-muted-foreground pl-1 text-sm">
                    <Link href={buildScopedHref('/dash/analytics/learners/at-risk')} className="text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1">
                      {t('overview.viewAllAtRisk')}
                    </Link>
                  </p>
                )}
              </div>
            </div>
          </TabsContent>

          {/* Tab 3: Performance Insights */}
          <TabsContent value="performance" className="space-y-6 outline-none">
            {/* Courses Overview */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 pl-1">
                <Badge variant="outline" className="text-xs font-semibold">
                  {t('overview.previewLabel')}
                </Badge>
                <span className="text-muted-foreground text-xs">
                  {t('overview.showingCourses', { total: data.course_total })}
                </span>
              </div>
              <Suspense fallback={<SectionFallback height="h-[320px]" />}>
                <CourseHealthTable rows={data.course_preview} storageKey="overview-courses" />
              </Suspense>
              <p className="text-muted-foreground pl-1 text-sm">
                <Link href={buildScopedHref('/dash/analytics/courses')} className="text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1">
                  {t('overview.viewAllCourses')}
                </Link>
              </p>
            </div>

            {/* Assessment Outliers & Bottlenecks */}
            <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
              <div className="space-y-4">
                <div className="flex items-center gap-2 pl-1">
                  <Badge variant="outline" className="text-xs font-semibold">
                    {t('overview.previewLabel')}
                  </Badge>
                  <span className="text-muted-foreground text-xs">
                    {t('overview.showingAssessments', { total: data.assessment_total })}
                  </span>
                </div>
                <Suspense fallback={<SectionFallback height="h-[320px]" />}>
                  <AssessmentOutliersTable rows={data.assessment_preview} storageKey="overview-assessments" />
                </Suspense>
                <p className="text-muted-foreground pl-1 text-sm">
                  <Link href={buildScopedHref('/dash/analytics/assessments')} className="text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1">
                    {t('overview.viewAllAssessments')}
                  </Link>
                </p>
              </div>

              <div className="space-y-4">
                <div className="pl-1 h-5 flex items-center">
                  <span className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">Content Friction</span>
                </div>
                <Suspense fallback={<SectionFallback height="h-[320px]" />}>
                  <ContentBottlenecksTable rows={data.content_bottlenecks} />
                </Suspense>
              </div>
            </div>
          </TabsContent>

          {/* Tab 4: Diagnostics & Operations */}
          <TabsContent value="operations" className="space-y-6 outline-none">
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
          </TabsContent>

          {/* Tab 5: Admin Console */}
          {adminData && (
            <TabsContent value="admin" className="space-y-6 outline-none">
              <Suspense fallback={<SectionFallback height="h-[520px]" />}>
                <AdminAnalyticsPanel data={adminData} />
              </Suspense>
            </TabsContent>
          )}
        </div>
      </Tabs>
    </div>
  )
}
