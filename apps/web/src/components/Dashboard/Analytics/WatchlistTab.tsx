'use client'

import { Suspense, lazy } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { AnalyticsQuery, TeacherOverviewResponse } from '@/types/analytics'
import { useTranslations } from 'next-intl'
import { Badge } from '@/components/ui/badge'
import { Link } from '@/i18n/navigation'
import { ClipboardCheck } from 'lucide-react'

const AnalyticsRiskDistributionChart = lazy(() => import('./AnalyticsRiskDistributionChart'))
const AtRiskLearnersTable = lazy(() => import('./AtRiskLearnersTable'))

const SectionFallback = ({ height = 'h-[280px]' }: { height?: string }) => (
  <Card className="border-border bg-card shadow-sm">
    <CardContent className={`${height} bg-muted animate-pulse rounded-lg`} />
  </Card>
)

interface WatchlistTabProps {
  query: AnalyticsQuery
  data: TeacherOverviewResponse
}

export default function WatchlistTab({ query, data }: WatchlistTabProps) {
  const t = useTranslations('TeacherAnalytics')

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

  const summaryCards = interventionSummary
    ? [
        {
          label: t('overview.interventionSummary.logged'),
          value: interventionSummary.total,
          borderClass: 'border-slate-200 dark:border-slate-800',
        },
        {
          label: t('overview.interventionSummary.open'),
          value: interventionSummary.open,
          borderClass: 'border-amber-200 dark:border-amber-900 bg-amber-500/5',
        },
        {
          label: t('overview.interventionSummary.resolved'),
          value: interventionSummary.resolved,
          borderClass: 'border-emerald-200 dark:border-emerald-900 bg-emerald-500/5',
        },
        {
          label: t('overview.interventionSummary.recovered'),
          value: interventionSummary.recovered_learners,
          borderClass: 'border-blue-200 dark:border-blue-900 bg-blue-500/5',
        },
      ]
    : []

  return (
    <div className="space-y-6">
      {interventionSummary && (
        <Card className="border-border bg-card/65 shadow-sm backdrop-blur-xs">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5 text-emerald-600" />
              <CardTitle>{t('overview.interventionTitle')}</CardTitle>
            </div>
            <CardDescription>{t('overview.interventionDescription')}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {summaryCards.map(({ label, value, borderClass }) => (
              <div key={label} className={`flex flex-col justify-between rounded-xl border p-4 ${borderClass}`}>
                <div className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">{label}</div>
                <div className="text-foreground mt-3 text-3xl font-extrabold">{value}</div>
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
              <Link
                href={buildScopedHref('/dash/analytics/learners/at-risk')}
                className="inline-flex items-center gap-1 text-blue-600 hover:underline dark:text-blue-400"
              >
                {t('overview.viewAllAtRisk')}
              </Link>
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
