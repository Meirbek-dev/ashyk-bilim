import WatchlistTab from '@components/Dashboard/Analytics/WatchlistTab'
import { getAtRiskLearners } from '@services/analytics/teacher'
import { AT_RISK_SORT_KEYS } from '@/lib/analytics/labels'
import AnalyticsPage from '../_components/AnalyticsPage'
import { analyticsPageMetadata } from '../_components/metadata'
import type { AnalyticsPageProps, AnalyticsTabData } from '../_components/AnalyticsPage'

/** The table sorts through `learners/at-risk` (the overview preview is fixed worst-first — UX-095). */
async function WatchlistData({ query, overview }: AnalyticsTabData) {
  const atRisk = await getAtRiskLearners(query).catch(() => null)
  return <WatchlistTab query={query} data={overview} atRisk={atRisk} />
}

const renderWatchlist = (data: AnalyticsTabData) => <WatchlistData {...data} />

export const generateMetadata = () => analyticsPageMetadata('tabs.watchlist')

export default function PlatformAnalyticsWatchlistPage(props: AnalyticsPageProps) {
  return <AnalyticsPage {...props} activeTab="watchlist" renderTab={renderWatchlist} sortKeys={AT_RISK_SORT_KEYS} />
}
