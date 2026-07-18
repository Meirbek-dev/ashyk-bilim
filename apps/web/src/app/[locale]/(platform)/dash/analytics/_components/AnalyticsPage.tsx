import AnalyticsEmptyState from '@components/Dashboard/Analytics/AnalyticsEmptyState'
import AnalyticsShell from '@components/Dashboard/Analytics/AnalyticsShell'
import { getAdminAnalyticsOverview, getTeacherOverview, normalizeAnalyticsQuery } from '@services/analytics/teacher'
import { Loader2 } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { Suspense } from 'react'
import type { ReactNode } from 'react'
import { redirect } from '@/i18n/navigation'
import { isApiError } from '@/lib/api/assertSuccess'
import type { AdminAnalyticsResponse, AnalyticsQuery, TeacherOverviewResponse } from '@/types/analytics'

export interface AnalyticsPageProps {
  params: Promise<{ locale: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export interface AnalyticsTabData {
  query: AnalyticsQuery
  overview: TeacherOverviewResponse
  adminData: AdminAnalyticsResponse | null
}

type ActiveTab = 'overview' | 'watchlist' | 'performance' | 'operations' | 'admin'

interface SharedAnalyticsPageProps extends AnalyticsPageProps {
  activeTab: ActiveTab
  renderTab: (data: AnalyticsTabData) => ReactNode
  requireAdmin?: boolean
}

export default function AnalyticsPage(props: SharedAnalyticsPageProps) {
  return (
    <Suspense
      fallback={
        <div className="flex h-[200px] w-full items-center justify-center">
          <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
        </div>
      }
    >
      <AnalyticsPageContent {...props} />
    </Suspense>
  )
}

export async function AnalyticsPageContent({
  params,
  searchParams,
  activeTab,
  renderTab,
  requireAdmin = false,
}: SharedAnalyticsPageProps) {
  const [resolvedParams, resolvedSearchParams] = await Promise.all([params, searchParams])
  const query = normalizeAnalyticsQuery(resolvedSearchParams)
  const t = await getTranslations({ locale: resolvedParams.locale, namespace: 'TeacherAnalytics' })

  let overview: TeacherOverviewResponse
  let adminData: AdminAnalyticsResponse | null
  try {
    const loadedData = await Promise.all([
      getTeacherOverview(query),
      getAdminAnalyticsOverview(query).catch((error: unknown) => {
        if (isApiError(error) && (error.status === 401 || error.status === 403)) return null
        throw error
      }),
    ])
    overview = loadedData[0]
    adminData = loadedData[1]
  } catch (error) {
    return (
      <AnalyticsEmptyState
        title={t('pages.overviewDisabledTitle')}
        description={error instanceof Error ? error.message : t('pages.overviewLoadError')}
      />
    )
  }

  if (requireAdmin && !adminData) {
    const urlParams = new URLSearchParams()
    if (query.window) urlParams.set('window', query.window)
    if (query.compare) urlParams.set('compare', query.compare)
    if (query.bucket) urlParams.set('bucket', query.bucket)
    if (query.course_ids) urlParams.set('course_ids', query.course_ids)
    if (query.cohort_ids) urlParams.set('cohort_ids', query.cohort_ids)
    if (query.teacher_user_id) urlParams.set('teacher_user_id', String(query.teacher_user_id))
    if (query.timezone) urlParams.set('timezone', query.timezone)
    const serialized = urlParams.toString()
    redirect({
      href: `/dash/analytics/overview${serialized ? `?${serialized}` : ''}`,
      locale: resolvedParams.locale,
    })
    return null
  }

  return (
    <AnalyticsShell query={query} overview={overview} adminData={adminData} activeTab={activeTab}>
      {renderTab({ query, overview, adminData })}
    </AnalyticsShell>
  )
}
