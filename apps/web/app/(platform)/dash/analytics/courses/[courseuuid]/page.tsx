import { getTeacherCourseDetailByUuid, normalizeAnalyticsQuery } from '@services/analytics/teacher';
import AssessmentOutliersTable from '@components/Dashboard/Analytics/AssessmentOutliersTable';
import { getAnalyticsSeverityLabel, getAnalyticsSignalLabel } from '@/lib/analytics/labels';
import CompletionFunnelChart from '@components/Dashboard/Analytics/CompletionFunnelChart';
import EngagementAreaChart from '@components/Dashboard/Analytics/EngagementAreaChart';
import AtRiskLearnersTable from '@components/Dashboard/Analytics/AtRiskLearnersTable';
import AnalyticsEmptyState from '@components/Dashboard/Analytics/AnalyticsEmptyState';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';

export default function PlatformAnalyticsCourseDetailPage(props: {
  params: Promise<{ courseuuid: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <PlatformAnalyticsCourseDetailPageInner
      params={props.params}
      searchParams={props.searchParams}
    />
  );
}

async function PlatformAnalyticsCourseDetailPageInner(props: {
  params: Promise<{ courseuuid: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { courseuuid } = await props.params;
  const query = normalizeAnalyticsQuery(await props.searchParams);
  const t = await getTranslations('TeacherAnalytics');

  try {
    const detail = await getTeacherCourseDetailByUuid(courseuuid, query);
    return (
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-6 px-4 py-6 md:px-6 xl:px-8">
        <Card className="border-slate-200 bg-white/90 shadow-sm">
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2 text-xs tracking-[0.18em] text-slate-500 uppercase">
              <Badge variant="outline">{t('pages.courseDetailBadge')}</Badge>
              <Badge variant="outline">{detail.course.course_uuid}</Badge>
            </div>
            <CardTitle className="mt-3 text-3xl">{detail.course.name}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 p-4">
              <div className="text-xs tracking-wide text-slate-500 uppercase">{t('pages.courseStatCompletion')}</div>
              <div className="mt-2 text-3xl font-semibold">{detail.summary.completion_rate}%</div>
            </div>
            <div className="rounded-2xl border border-slate-200 p-4">
              <div className="text-xs tracking-wide text-slate-500 uppercase">{t('pages.courseStatAvgProgress')}</div>
              <div className="mt-2 text-3xl font-semibold">{detail.summary.avg_progress_pct}%</div>
            </div>
            <div className="rounded-2xl border border-slate-200 p-4">
              <div className="text-xs tracking-wide text-slate-500 uppercase">{t('pages.courseStatUngraded')}</div>
              <div className="mt-2 text-3xl font-semibold">{detail.summary.ungraded_submissions}</div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 xl:grid-cols-2">
          <EngagementAreaChart
            title={t('pages.courseEngagementTitle')}
            description={t('pages.courseEngagementDesc')}
            data={detail.engagement_trend}
          />
          <CompletionFunnelChart
            title={t('pages.courseFunnelTitle')}
            description={t('pages.courseFunnelDesc')}
            data={detail.funnels.course_completion ?? []}
          />
        </div>

        <CompletionFunnelChart
          title={t('pages.courseChapterDropoffTitle')}
          description={t('pages.courseChapterDropoffDesc')}
          data={detail.funnels.chapter_dropoff ?? []}
        />

        <Card className="border-slate-200 bg-white/90 shadow-sm">
          <CardHeader>
            <CardTitle>{t('pages.courseContentHealthTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3">
            {detail.content_health.map((item) => (
              <div
                key={item.signal}
                className="rounded-2xl border border-slate-200 p-4"
              >
                <div className="flex items-center gap-2">
                  <Badge
                    variant={
                      item.severity === 'critical' ? 'destructive' : item.severity === 'warning' ? 'warning' : 'outline'
                    }
                  >
                    {getAnalyticsSeverityLabel(t, item.severity)}
                  </Badge>
                  <span className="text-sm font-medium text-slate-800">{getAnalyticsSignalLabel(t, item.signal)}</span>
                </div>
                <div className="mt-3 text-sm leading-6 text-slate-600">{item.note}</div>
                {item.value !== null ? (
                  <div className="mt-3 text-2xl font-semibold text-slate-900">{item.value}</div>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>

        <AssessmentOutliersTable rows={detail.assessment_outliers} />
        <AtRiskLearnersTable
          rows={detail.at_risk_learners}
          title={t('pages.courseAtRiskTitle')}
          description={t('pages.courseAtRiskDescription')}
        />
      </div>
    );
  } catch (error) {
    return (
      <AnalyticsEmptyState
        title={t('pages.courseDetailTitle')}
        description={error instanceof Error ? error.message : t('pages.courseDetailLoadError')}
      />
    );
  }
}
