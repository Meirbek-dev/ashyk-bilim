import { getAdminAnalyticsOverview, getTeacherOverview, normalizeAnalyticsQuery } from '@services/analytics/teacher'
import AnalyticsEmptyState from '@components/Dashboard/Analytics/AnalyticsEmptyState'
import AnalyticsShell from '@components/Dashboard/Analytics/AnalyticsShell'
import AdminTab from '@components/Dashboard/Analytics/AdminTab'
import { getTranslations } from 'next-intl/server'
import { redirect } from '@/i18n/navigation'

interface PageProps {
  params: Promise<{ locale: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function PlatformAnalyticsAdminPage(props: PageProps) {
  const [resolvedParams, resolvedSearchParams] = await Promise.all([props.params, props.searchParams])
  const query = normalizeAnalyticsQuery(resolvedSearchParams)
  const t = await getTranslations('TeacherAnalytics')

  try {
    const [overview, adminData] = await Promise.all([
      getTeacherOverview(query),
      getAdminAnalyticsOverview(query).catch(() => null),
    ])

    if (!adminData) {
      const params = new URLSearchParams()
      if (query.window) params.set('window', query.window)
      if (query.compare) params.set('compare', query.compare)
      if (query.bucket) params.set('bucket', query.bucket)
      if (query.course_ids) params.set('course_ids', query.course_ids)
      if (query.cohort_ids) params.set('cohort_ids', query.cohort_ids)
      if (query.teacher_user_id) params.set('teacher_user_id', String(query.teacher_user_id))
      if (query.timezone) params.set('timezone', query.timezone)
      const serialized = params.toString()
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
  } catch (error) {
    return (
      <AnalyticsEmptyState
        title={t('pages.overviewDisabledTitle')}
        description={error instanceof Error ? error.message : t('pages.overviewLoadError')}
      />
    )
  }
}
