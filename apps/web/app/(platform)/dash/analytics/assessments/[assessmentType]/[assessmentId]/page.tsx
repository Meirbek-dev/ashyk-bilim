import AnalyticsThresholdHistogram from '@components/Dashboard/Analytics/AnalyticsThresholdHistogram';
import AssessmentLearnerRowsTable from '@components/Dashboard/Analytics/AssessmentLearnerRowsTable';
import { getTeacherAssessmentDetail, normalizeAnalyticsQuery } from '@services/analytics/teacher';
import QuestionDifficultyRadar from '@components/Dashboard/Analytics/QuestionDifficultyRadar';
import AnalyticsEmptyState from '@components/Dashboard/Analytics/AnalyticsEmptyState';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getAnalyticsAssessmentTypeLabel } from '@/lib/analytics/labels';
import { getLocale, getTranslations } from 'next-intl/server';
import type { AssessmentType } from '@/types/analytics';
import { Badge } from '@/components/ui/badge';

export default function PlatformAnalyticsAssessmentDetailPage(props: {
  params: Promise<{ assessmentType: AssessmentType; assessmentId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <PlatformAnalyticsAssessmentDetailPageInner
      params={props.params}
      searchParams={props.searchParams}
    />
  );
}

async function PlatformAnalyticsAssessmentDetailPageInner(props: {
  params: Promise<{ assessmentType: AssessmentType; assessmentId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { assessmentType, assessmentId } = await props.params;
  const query = normalizeAnalyticsQuery(await props.searchParams);
  const locale = await getLocale();
  const t = await getTranslations('TeacherAnalytics');

  try {
    const detail = await getTeacherAssessmentDetail({
      assessmentType,
      assessmentId: Number(assessmentId),
      query,
    });
    return (
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-6 px-4 py-6 md:px-6 xl:px-8">
        <Card className="border-slate-200 bg-white/90 shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Badge variant="outline">{getAnalyticsAssessmentTypeLabel(t, detail.assessment_type)}</Badge>
              <Badge variant="outline">{t('pages.assessmentDetailBadge', { id: detail.assessment_id })}</Badge>
            </div>
            <CardTitle className="mt-3 text-3xl">{detail.title}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 p-4">
              <div className="text-xs tracking-wide text-slate-500 uppercase">
                {t('pages.assessmentStatSubmissionRate')}
              </div>
              <div className="mt-2 text-3xl font-semibold">
                {detail.summary.submission_rate ?? t('atRisk.na')}
                {detail.summary.submission_rate !== null ? '%' : ''}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 p-4">
              <div className="text-xs tracking-wide text-slate-500 uppercase">{t('pages.assessmentStatPassRate')}</div>
              <div className="mt-2 text-3xl font-semibold">
                {detail.summary.pass_rate ?? t('atRisk.na')}
                {detail.summary.pass_rate !== null ? '%' : ''}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 p-4">
              <div className="text-xs tracking-wide text-slate-500 uppercase">
                {t('pages.assessmentStatMedianScore')}
              </div>
              <div className="mt-2 text-3xl font-semibold">
                {detail.summary.median_score ?? t('atRisk.na')}
                {detail.summary.median_score !== null ? '%' : ''}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 p-4">
              <div className="text-xs tracking-wide text-slate-500 uppercase">{t('pages.assessmentStatGenerated')}</div>
              <div className="mt-2 text-lg font-semibold">{new Date(detail.generated_at).toLocaleString(locale)}</div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 xl:grid-cols-2">
          <AnalyticsThresholdHistogram
            title={t('pages.assessmentScoreDistTitle')}
            description={t('pages.assessmentScoreDistDesc')}
            data={detail.score_distribution}
            thresholdLabel={
              detail.pass_threshold !== null
                ? `${t('pages.assessmentPassThresholdDefault')} ${detail.pass_threshold}%`
                : undefined
            }
            thresholdBucketLabel={detail.pass_threshold_bucket_label || undefined}
          />
          <AnalyticsThresholdHistogram
            title={t('pages.assessmentAttemptDistTitle')}
            description={t('pages.assessmentAttemptDistDesc')}
            data={detail.attempt_distribution}
          />
        </div>

        {detail.question_breakdown?.length ? (
          <QuestionDifficultyRadar
            title={t('pages.assessmentQuestionTitle')}
            description={t('pages.assessmentQuestionDesc')}
            data={detail.question_breakdown}
          />
        ) : null}

        <Card className="border-slate-200 bg-white/90 shadow-sm">
          <CardHeader>
            <CardTitle>{t('pages.assessmentCommonFailuresTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {detail.common_failures.length ? (
              detail.common_failures.map((failure) => (
                <Badge
                  key={failure.key}
                  variant="outline"
                >
                  {failure.label} · {failure.count}
                </Badge>
              ))
            ) : (
              <div className="text-sm text-slate-500">{t('pages.assessmentNoCommonFailures')}</div>
            )}
          </CardContent>
        </Card>

        <AssessmentLearnerRowsTable
          rows={detail.learner_rows}
          storageKey={`assessment-${detail.assessment_type}-${detail.assessment_id}-learners`}
        />
      </div>
    );
  } catch (error) {
    return (
      <AnalyticsEmptyState
        title={t('pages.assessmentDetailTitle')}
        description={error instanceof Error ? error.message : t('pages.assessmentDetailLoadError')}
      />
    );
  }
}
