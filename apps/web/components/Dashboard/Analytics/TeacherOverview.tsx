'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getAnalyticsAlertTypeLabel, getAnalyticsSeverityLabel } from '@/lib/analytics/labels';
import type { AnalyticsQuery, TeacherOverviewResponse } from '@/types/analytics';
import { getAnalyticsExportUrl } from '@services/analytics/teacher';
import type { AnalyticsFilterOption } from '@/types/analytics';
import AnalyticsExportButton from './AnalyticsExportButton';
import { useLocale, useTranslations } from 'next-intl';
import TeacherFilterBar from './TeacherFilterBar';
import { Badge } from '@/components/ui/badge';
import { useRouter } from 'next/navigation';
import { lazy, Suspense } from 'react';
import Link from 'next/link';

const AnalyticsRiskDistributionChart = lazy(() => import('./AnalyticsRiskDistributionChart'));
const AnalyticsMultiSeriesTrendChart = lazy(() => import('./AnalyticsMultiSeriesTrendChart'));
const AssessmentOutliersTable = lazy(() => import('./AssessmentOutliersTable'));
const GradingBacklogPanel = lazy(() => import('./GradingBacklogPanel'));
const AtRiskLearnersTable = lazy(() => import('./AtRiskLearnersTable'));
const CourseHealthTable = lazy(() => import('./CourseHealthTable'));
const TeacherKpiCharts = lazy(() => import('./TeacherKpiCharts'));
const TeacherKpiCards = lazy(() => import('./TeacherKpiCards'));

interface TeacherOverviewProps {
  query: AnalyticsQuery;
  data: TeacherOverviewResponse;
  courseOptions?: AnalyticsFilterOption[];
  cohortOptions?: AnalyticsFilterOption[];
}

export default function TeacherOverview({ query, data, courseOptions = [], cohortOptions = [] }: TeacherOverviewProps) {
  const t = useTranslations('TeacherAnalytics');
  const locale = useLocale();
  const router = useRouter();

  function formatFreshness(seconds: number): string {
    if (seconds <= 0) return t('freshness.live');
    if (seconds < 60) return t('freshness.seconds', { seconds });
    if (seconds < 3600) return t('freshness.minutes', { minutes: Math.round(seconds / 60) });
    if (seconds < 86_400) return t('freshness.hours', { hours: Math.round(seconds / 3600) });
    return t('freshness.days', { days: Math.round(seconds / 86_400) });
  }

  // Align trend series by the union of bucket timestamps so sparse series are not dropped.
  const allBuckets = [
    ...new Set([
      ...data.trends.active_learners.map((point) => point.bucket_start),
      ...data.trends.completions.map((point) => point.bucket_start),
      ...data.trends.submissions.map((point) => point.bucket_start),
      ...data.trends.grading_completed.map((point) => point.bucket_start),
    ]),
  ].toSorted();
  const completionsMap = new Map(data.trends.completions.map((p) => [p.bucket_start, p.value]));
  const submissionsMap = new Map(data.trends.submissions.map((p) => [p.bucket_start, p.value]));
  const gradingMap = new Map(data.trends.grading_completed.map((p) => [p.bucket_start, p.value]));
  const activeMap = new Map(data.trends.active_learners.map((p) => [p.bucket_start, p.value]));
  const trendData = allBuckets.map((bucketStart) => ({
    bucket_start: bucketStart,
    bucket: new Date(bucketStart).toLocaleDateString(locale, { month: 'short', day: 'numeric' }),
    active_learners: activeMap.get(bucketStart) ?? 0,
    completions: completionsMap.get(bucketStart) ?? 0,
    submissions: submissionsMap.get(bucketStart) ?? 0,
    grading_completed: gradingMap.get(bucketStart) ?? 0,
  }));

  // Build KPI cards with correct trend series.
  // Only active_learners has a true per-bucket time-series trend to display.
  // For all other metrics, pass an empty sparkline so the card renders cleanly without
  // a misleading proxy line (issue 2). Definitions are added for `returning_learners`,
  // `at_risk`, `content_health`, and `difficulty` (issue 3).
  const kpiCards = [
    {
      metric: data.summary.active_learners,
      sparkline: data.trends.active_learners.map((p) => p.value),
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
      sparkline: data.trends.completions.map((p) => p.value),
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
  ];

  // Context-aware chart click: if submissions > active_learners in the clicked bucket,
  // route to the filtered assessment list; otherwise route to the course health list (issue 14).
  const handleTrendClick = (
    bucketStart: string,
    row?: { active_learners: number; submissions: number; grading_completed: number },
  ) => {
    const params = new URLSearchParams();
    if (query.window) params.set('window', query.window);
    if (query.compare) params.set('compare', query.compare);
    if (query.bucket) params.set('bucket', query.bucket);
    if (query.course_ids) params.set('course_ids', query.course_ids);
    if (query.cohort_ids) params.set('cohort_ids', query.cohort_ids);
    if (query.timezone) params.set('timezone', query.timezone);
    params.set('bucket_start', bucketStart);

    const isSubmissionDominant = row && row.submissions + row.grading_completed >= row.active_learners;
    if (isSubmissionDominant) {
      params.set('sort_by', 'signals');
      router.push(`/dash/analytics/assessments?${params.toString()}`);
    } else {
      router.push(`/dash/analytics/courses?${params.toString()}`);
    }
  };

  const SectionFallback = ({ height = 'h-[280px]' }: { height?: string }) => (
    <Card className="shadow-sm">
      <CardContent className={`${height} bg-muted animate-pulse rounded-lg`} />
    </Card>
  );

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-6 px-4 py-6 md:px-6 xl:px-8">
      <section className="bg-card overflow-hidden rounded-xl border p-6 shadow-sm md:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
              {t('overview.label')}
            </div>
            <h1 className="text-foreground mt-3 max-w-3xl text-3xl font-semibold tracking-tight md:text-4xl">
              {t('overview.heading')}
            </h1>
            <p className="text-muted-foreground mt-3 max-w-3xl text-sm leading-6 md:text-base">
              {t('overview.description')}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <AnalyticsExportButton
              href={getAnalyticsExportUrl('at-risk', query)}
              label={t('overview.exportAtRisk')}
            />
            <AnalyticsExportButton
              href={getAnalyticsExportUrl('grading-backlog', query)}
              label={t('overview.exportGradingBacklog')}
            />
          </div>
        </div>
      </section>

      <TeacherFilterBar
        query={query}
        courseCount={data.scope.course_ids.length}
        courseOptions={courseOptions.length ? courseOptions : data.course_options}
        cohortOptions={cohortOptions.length ? cohortOptions : data.cohort_options}
      />

      <Suspense fallback={<SectionFallback height="h-[220px]" />}>
        <TeacherKpiCards cards={kpiCards} />
      </Suspense>

      <Suspense fallback={<SectionFallback height="h-[420px]" />}>
        <TeacherKpiCharts
          metrics={data.summary}
          trends={data.trends}
        />
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
          <GradingBacklogPanel
            backlogCount={data.summary.ungraded_submissions.value}
            alerts={data.alerts}
          />
        </Suspense>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <Suspense fallback={<SectionFallback height="h-[320px]" />}>
          <AnalyticsRiskDistributionChart
            counts={data.risk_distribution}
            totalAtRisk={data.summary.at_risk_learners.value}
          />
        </Suspense>
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>{t('overview.freshnessTitle')}</CardTitle>
            <CardDescription>{t('overview.freshnessDescription')}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div className="bg-muted rounded-lg border p-4">
              <div className="text-muted-foreground text-xs tracking-wider uppercase">
                {t('overview.labelGenerated')}
              </div>
              <div className="text-foreground mt-2 text-lg font-semibold">
                {new Date(data.generated_at).toLocaleString(locale)}
              </div>
            </div>
            <div className="bg-muted rounded-lg border p-4">
              <div className="text-muted-foreground text-xs tracking-wider uppercase">
                {t('overview.labelFreshness')}
              </div>
              <div className="text-foreground mt-2 text-lg font-semibold">
                {formatFreshness(data.freshness_seconds)}
              </div>
            </div>
            <div className="bg-muted rounded-lg border p-4">
              <div className="text-muted-foreground text-xs tracking-wider uppercase">
                {t('overview.labelScopedCourses')}
              </div>
              <div className="text-foreground mt-2 text-lg font-semibold">{data.scope.course_ids.length}</div>
            </div>
            <div className="bg-muted rounded-lg border p-4">
              <div className="text-muted-foreground text-xs tracking-wider uppercase">{t('overview.labelCohorts')}</div>
              <div className="text-foreground mt-2 text-lg font-semibold">
                {data.scope.cohort_ids.length || t('overview.cohortsAll')}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>{t('overview.alertsTitle')}</CardTitle>
          <CardDescription>{t('overview.alertsDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {data.alerts.length ? (
            data.alerts.map((alert) => (
              <div
                key={alert.id}
                className="bg-muted rounded-lg border p-4"
              >
                <div className="mb-2 flex items-center gap-2">
                  <Badge
                    variant={
                      alert.severity === 'critical'
                        ? 'destructive'
                        : alert.severity === 'warning'
                          ? 'warning'
                          : 'outline'
                    }
                  >
                    {getAnalyticsSeverityLabel(t, alert.severity)}
                  </Badge>
                  <span className="text-muted-foreground text-xs tracking-wider uppercase">
                    {getAnalyticsAlertTypeLabel(t, alert.type)}
                  </span>
                </div>
                <div className="text-foreground font-medium">{alert.title}</div>
                <div className="text-muted-foreground mt-2 text-sm leading-6">{alert.body}</div>
              </div>
            ))
          ) : (
            <div className="text-muted-foreground text-sm">{t('overview.alertsEmpty')}</div>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-col gap-6">
        <div>
          {/* Preview badge always visible (issue 4) */}
          <div className="mb-2 flex items-center gap-2">
            <Badge
              variant="outline"
              className="text-xs"
            >
              {t('overview.previewLabel')}
            </Badge>
            <span className="text-muted-foreground text-xs">
              {t('overview.showingCourses', { total: data.course_total })}
            </span>
          </div>
          <Suspense fallback={<SectionFallback height="h-[320px]" />}>
            <CourseHealthTable
              rows={data.course_preview}
              storageKey="overview-courses"
            />
          </Suspense>
          <p className="text-muted-foreground mt-2 text-sm">
            <Link
              href="/dash/analytics/courses"
              className="text-blue-600 hover:underline"
            >
              {t('overview.viewAllCourses')}
            </Link>
          </p>
        </div>
        <div>
          <div className="mb-2 flex items-center gap-2">
            <Badge
              variant="outline"
              className="text-xs"
            >
              {t('overview.previewLabel')}
            </Badge>
            <span className="text-muted-foreground text-xs">
              {t('overview.showingAssessments', { total: data.assessment_total })}
            </span>
          </div>
          <Suspense fallback={<SectionFallback height="h-[320px]" />}>
            <AssessmentOutliersTable
              rows={data.assessment_preview}
              storageKey="overview-assessments"
            />
          </Suspense>
          <p className="text-muted-foreground mt-2 text-sm">
            <Link
              href="/dash/analytics/assessments"
              className="text-blue-600 hover:underline"
            >
              {t('overview.viewAllAssessments')}
            </Link>
          </p>
        </div>
      </div>

      {/* At-risk section with preview badge + CTA (issue 4). */}
      <div>
        <div className="mb-2 flex items-center gap-2">
          <Badge
            variant="outline"
            className="text-xs"
          >
            {t('overview.previewLabel')}
          </Badge>
          <span className="text-muted-foreground text-xs">
            {t('riskDistribution.preview', {
              shown: data.at_risk_preview.length,
              total: data.at_risk_total,
            })}
          </span>
        </div>
        <Suspense fallback={<SectionFallback height="h-[320px]" />}>
          <AtRiskLearnersTable
            rows={data.at_risk_preview}
            title={t('overview.watchlistTitle')}
            description={t('overview.watchlistDescription')}
            storageKey="overview-risk"
          />
        </Suspense>
        {data.at_risk_total > 0 && (
          <p className="text-muted-foreground mt-2 text-sm">
            <Link
              href="/dash/analytics/learners/at-risk"
              className="text-blue-600 hover:underline"
            >
              {t('overview.viewAllAtRisk')}
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
