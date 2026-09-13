import AnalyticsThresholdHistogram from '@components/Dashboard/Analytics/AnalyticsThresholdHistogram'
import AssessmentLearnerRowsTable from '@components/Dashboard/Analytics/AssessmentLearnerRowsTable'
import AssessmentOperationsPanel from '@components/Dashboard/Analytics/AssessmentOperationsPanel'
import { getTeacherAssessmentDetail, normalizeAnalyticsQuery } from '@services/analytics/teacher'
import QuestionDifficultyRadar from '@components/Dashboard/Analytics/QuestionDifficultyRadar'
import AnalyticsEmptyState from '@components/Dashboard/Analytics/AnalyticsEmptyState'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getAnalyticsAssessmentTypeLabel } from '@/lib/analytics/labels'
import { getFormatter, getLocale, getTranslations } from 'next-intl/server'
import { describeAnalyticsError } from '@/lib/analytics/errors'
import type { AssessmentType } from '@/types/analytics'
import { fromUnix } from '@/lib/api/contract'
import { Badge } from '@/components/ui/badge'
import { getAssessment } from '@/lib/api/generated/assessments/assessments'
import { analyticsPageMetadata } from '../../../_components/metadata'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { isApiError } from '@/lib/api/assertSuccess'
import { AssessmentId, AssessmentKind } from '@/lib/api/generated/zod'

export async function generateMetadata({ params }: { params: Promise<{ assessmentId: string }> }): Promise<Metadata> {
  const { assessmentId } = await params
  const assessment = await getAssessment(assessmentId).catch(() => null)
  return assessment?.title ? { title: assessment.title } : analyticsPageMetadata('pages.assessmentsTitle')
}

export default function PlatformAnalyticsAssessmentDetailPage(props: {
  params: Promise<{ assessmentType: AssessmentType; assessmentId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  return <PlatformAnalyticsAssessmentDetailPageInner params={props.params} searchParams={props.searchParams} />
}

async function PlatformAnalyticsAssessmentDetailPageInner(props: {
  params: Promise<{ assessmentType: AssessmentType; assessmentId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [{ assessmentType, assessmentId }, searchParams, locale, t, tErrors, format] = await Promise.all([
    props.params,
    props.searchParams,
    getLocale(),
    getTranslations('TeacherAnalytics'),
    getTranslations('Errors'),
    getFormatter(),
  ])
  if (!AssessmentKind.safeParse(assessmentType).success || !AssessmentId.safeParse(assessmentId).success) notFound()
  const query = normalizeAnalyticsQuery(searchParams)

  let detail: Awaited<ReturnType<typeof getTeacherAssessmentDetail>>
  try {
    detail = await getTeacherAssessmentDetail({
      assessmentType,
      assessmentId,
      query,
    })
  } catch (error) {
    // Unknown assessment, wrong kind or out of scope: the not-found page, not an English detail.
    if (isApiError(error) && error.status === 404) notFound()
    return (
      <AnalyticsEmptyState
        title={t('pages.assessmentDetailTitle')}
        description={describeAnalyticsError(error, t, tErrors, t('pages.assessmentDetailLoadError'))}
      />
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-6 px-4 py-6 md:px-6 xl:px-8">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Badge variant="outline">{getAnalyticsAssessmentTypeLabel(t, detail.assessment_type)}</Badge>
          </div>
          <CardTitle className="mt-3 text-2xl">{detail.title}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-border grid divide-x border-t md:grid-cols-4">
            <div className="px-4 py-3">
              <div className="text-muted-foreground text-[10px] tracking-wide uppercase">
                {t('pages.assessmentStatSubmissionRate')}
              </div>
              <div className="text-foreground mt-1 text-2xl font-semibold tabular-nums">
                {detail.summary.submission_rate ?? t('atRisk.na')}
                {detail.summary.submission_rate != null ? '%' : ''}
              </div>
            </div>
            <div className="px-4 py-3">
              <div className="text-muted-foreground text-[10px] tracking-wide uppercase">
                {t('pages.assessmentStatPassRate')}
              </div>
              <div className="text-foreground mt-1 text-2xl font-semibold tabular-nums">
                {detail.summary.pass_rate == null
                  ? t('atRisk.na')
                  : `${format.number(detail.summary.pass_rate, { maximumFractionDigits: 1 })}%`}
              </div>
            </div>
            <div className="px-4 py-3">
              <div className="text-muted-foreground text-[10px] tracking-wide uppercase">
                {t('pages.assessmentStatMedianScore')}
              </div>
              <div className="text-foreground mt-1 text-2xl font-semibold tabular-nums">
                {detail.summary.median_score == null
                  ? t('atRisk.na')
                  : `${format.number(detail.summary.median_score, { maximumFractionDigits: 1 })}%`}
              </div>
            </div>
            <div className="px-4 py-3">
              <div className="text-muted-foreground text-[10px] tracking-wide uppercase">
                {t('pages.assessmentStatGenerated')}
              </div>
              {/* Intl output for kk-KZ differs between the server's ICU and a client without kk data; keep the server text. */}
              <div className="text-foreground mt-1 text-sm font-semibold" suppressHydrationWarning>
                {fromUnix(detail.generated_at_unix).toLocaleString(locale)}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <AnalyticsThresholdHistogram
          title={t('pages.assessmentScoreDistTitle')}
          description={t('pages.assessmentScoreDistDesc')}
          data={detail.score_distribution}
          {...(detail.pass_threshold != null
            ? {
                thresholdLabel: t('pages.assessmentPassThreshold', { value: detail.pass_threshold }),
              }
            : {})}
          {...(detail.pass_threshold_bucket_label ? { thresholdBucketLabel: detail.pass_threshold_bucket_label } : {})}
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

      <Card>
        <CardHeader>
          <CardTitle>{t('pages.assessmentCommonFailuresTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {detail.common_failures.length ? (
            detail.common_failures.map(failure => (
              <Badge key={failure.key} variant="outline">
                {failure.label} · {failure.count}
              </Badge>
            ))
          ) : (
            <div className="text-muted-foreground text-sm">{t('pages.assessmentNoCommonFailures')}</div>
          )}
        </CardContent>
      </Card>

      <AssessmentOperationsPanel detail={detail} />

      <AssessmentLearnerRowsTable
        rows={detail.learner_rows}
        storageKey={`assessment-${detail.assessment_type}-${detail.assessment_id}-learners`}
      />
    </div>
  )
}
