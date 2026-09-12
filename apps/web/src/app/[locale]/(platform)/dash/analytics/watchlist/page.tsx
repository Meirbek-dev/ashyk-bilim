import WatchlistTab from '@components/Dashboard/Analytics/WatchlistTab'
import AnalyticsPage from '../_components/AnalyticsPage'
import { analyticsPageMetadata } from '../_components/metadata'
import type { AnalyticsPageProps, AnalyticsTabData } from '../_components/AnalyticsPage'

const renderWatchlist = ({ query, overview }: AnalyticsTabData) => <WatchlistTab query={query} data={overview} />

export const generateMetadata = () => analyticsPageMetadata('tabs.watchlist')

export default function PlatformAnalyticsWatchlistPage(props: AnalyticsPageProps) {
  return <AnalyticsPage {...props} activeTab="watchlist" renderTab={renderWatchlist} />
}
