import { getAdminAnalyticsOverview, getTeacherOverview, normalizeAnalyticsQuery } from '@services/analytics/teacher'
import AnalyticsEmptyState from '@components/Dashboard/Analytics/AnalyticsEmptyState'
import AnalyticsShell from '@components/Dashboard/Analytics/AnalyticsShell'
import AdminTab from '@components/Dashboard/Analytics/AdminTab'
import { getTranslations } from 'next-intl/server'
import { redirect } from '@/i18n/navigation'
import { Suspense } from 'react'
import { Loader2 } from 'lucide-react'

interface PageProps {
  params: Promise<{ locale: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default function PlatformAnalyticsAdminPage(props: PageProps) {
  return (
    <Suspense
      fallback={
        <div className="flex h-[200px] w-full items-center justify-center">
          <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
        </div>
      }
    >
      <AdminContent params={props.params} searchParams={props.searchParams} />
    </Suspense>
  )
}

async function AdminContent({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [resolvedParams, resolvedSearchParams] = await Promise.all([params, searchParams])
  const query = normalizeAnalyticsQuery(resolvedSearchParams)
  const t = await getTranslations({ locale: resolvedParams.locale, namespace: 'TeacherAnalytics' })

  let overview: Awaited<ReturnType<typeof getTeacherOverview>>
  let adminData: Awaited<ReturnType<typeof getAdminAnalyticsOverview>> | null
  try {
    const [resOverview, resAdminData] = await Promise.all([
      getTeacherOverview(query),
      getAdminAnalyticsOverview(query).catch(() => null),
    ])
    overview = resOverview
    adminData = resAdminData
  } catch (error) {
    return (
      <AnalyticsEmptyState
        title={t('pages.overviewDisabledTitle')}
        description={error instanceof Error ? error.message : t('pages.overviewLoadError')}
      />
    )
  }

  if (!adminData) {
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
  }

  return (
    <AnalyticsShell query={query} overview={overview} adminData={adminData} activeTab="admin">
      <AdminTab adminData={adminData!} />
    </AnalyticsShell>
  )
}
