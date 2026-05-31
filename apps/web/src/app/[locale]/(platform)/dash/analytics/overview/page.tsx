import { getAdminAnalyticsOverview, getTeacherOverview, normalizeAnalyticsQuery } from '@services/analytics/teacher'
import AnalyticsEmptyState from '@components/Dashboard/Analytics/AnalyticsEmptyState'
import AnalyticsShell from '@components/Dashboard/Analytics/AnalyticsShell'
import OverviewTab from '@components/Dashboard/Analytics/OverviewTab'
import { getTranslations } from 'next-intl/server'

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function PlatformAnalyticsOverviewPage(props: PageProps) {
  const query = normalizeAnalyticsQuery(await props.searchParams)
  const t = await getTranslations('TeacherAnalytics')

  try {
    const [overview, adminData] = await Promise.all([
      getTeacherOverview(query),
      getAdminAnalyticsOverview(query).catch(() => null),
    ])

    return (
      <AnalyticsShell query={query} overview={overview} adminData={adminData} activeTab="overview">
        <OverviewTab query={query} data={overview} />
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
