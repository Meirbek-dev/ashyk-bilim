import OverviewTab from '@components/Dashboard/Analytics/OverviewTab'
import AnalyticsPage from '../_components/AnalyticsPage'
import { analyticsPageMetadata } from '../_components/metadata'
import type { AnalyticsPageProps, AnalyticsTabData } from '../_components/AnalyticsPage'

const renderOverview = ({ query, overview }: AnalyticsTabData) => <OverviewTab query={query} data={overview} />

export const generateMetadata = () => analyticsPageMetadata('tabs.overview')

export default function PlatformAnalyticsOverviewPage(props: AnalyticsPageProps) {
  return <AnalyticsPage {...props} activeTab="overview" renderTab={renderOverview} />
}
