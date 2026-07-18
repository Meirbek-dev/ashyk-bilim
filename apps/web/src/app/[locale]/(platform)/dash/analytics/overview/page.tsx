import OverviewTab from '@components/Dashboard/Analytics/OverviewTab'
import AnalyticsPage from '../_components/AnalyticsPage'
import type { AnalyticsPageProps, AnalyticsTabData } from '../_components/AnalyticsPage'

const renderOverview = ({ query, overview }: AnalyticsTabData) => <OverviewTab query={query} data={overview} />

export default function PlatformAnalyticsOverviewPage(props: AnalyticsPageProps) {
  return <AnalyticsPage {...props} activeTab="overview" renderTab={renderOverview} />
}
