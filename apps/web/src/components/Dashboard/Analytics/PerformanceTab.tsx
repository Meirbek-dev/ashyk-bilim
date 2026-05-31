'use client'

import { Suspense, lazy } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import type { AnalyticsQuery, TeacherOverviewResponse } from '@/types/analytics'
import { useTranslations } from 'next-intl'
import { Badge } from '@/components/ui/badge'
import { Link } from '@/i18n/navigation'

const CourseHealthTable = lazy(() => import('./CourseHealthTable'))
const AssessmentOutliersTable = lazy(() => import('./AssessmentOutliersTable'))
const ContentBottlenecksTable = lazy(() => import('./ContentBottlenecksTable'))

const SectionFallback = ({ height = 'h-[280px]' }: { height?: string }) => (
  <Card className="border-border bg-card shadow-sm">
    <CardContent className={`${height} bg-muted animate-pulse rounded-lg`} />
  </Card>
)

interface PerformanceTabProps {
  query: AnalyticsQuery
  data: TeacherOverviewResponse
}

export default function PerformanceTab({ query, data }: PerformanceTabProps) {
  const t = useTranslations('TeacherAnalytics')

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

  return (
    <div className="space-y-6">
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
          <Link
            href={buildScopedHref('/dash/analytics/courses')}
            className="inline-flex items-center gap-1 text-blue-600 hover:underline dark:text-blue-400"
          >
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
            <Link
              href={buildScopedHref('/dash/analytics/assessments')}
              className="inline-flex items-center gap-1 text-blue-600 hover:underline dark:text-blue-400"
            >
              {t('overview.viewAllAssessments')}
            </Link>
          </p>
        </div>

        <div className="space-y-4">
          <div className="flex h-5 items-center pl-1">
            <span className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
              {t('overview.contentFriction')}
            </span>
          </div>
          <Suspense fallback={<SectionFallback height="h-[320px]" />}>
            <ContentBottlenecksTable rows={data.content_bottlenecks} />
          </Suspense>
        </div>
      </div>
    </div>
  )
}
