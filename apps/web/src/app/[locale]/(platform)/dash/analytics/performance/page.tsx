import { getAdminAnalyticsOverview, getTeacherOverview, normalizeAnalyticsQuery } from '@services/analytics/teacher'
import AnalyticsEmptyState from '@components/Dashboard/Analytics/AnalyticsEmptyState'
import AnalyticsShell from '@components/Dashboard/Analytics/AnalyticsShell'
import PerformanceTab from '@components/Dashboard/Analytics/PerformanceTab'
import { getTranslations } from 'next-intl/server'
import { Suspense } from 'react'
import { Loader2 } from 'lucide-react'

interface PageProps {
  params: Promise<{ locale: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default function PlatformAnalyticsPerformancePage(props: PageProps) {
  return (
    <Suspense
      fallback={
        <div className="flex h-[200px] w-full items-center justify-center">
          <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
        </div>
      }
    >
      <PerformanceContent params={props.params} searchParams={props.searchParams} />
    </Suspense>
  )
}

async function PerformanceContent({
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

  return (
    <AnalyticsShell query={query} overview={overview} adminData={adminData} activeTab="performance">
      <PerformanceTab query={query} data={overview} />
    </AnalyticsShell>
  )
}
