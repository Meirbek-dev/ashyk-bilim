import PerformanceTab from '@components/Dashboard/Analytics/PerformanceTab'
import AnalyticsPage from '../_components/AnalyticsPage'
import { analyticsPageMetadata } from '../_components/metadata'
import type { AnalyticsPageProps, AnalyticsTabData } from '../_components/AnalyticsPage'

const renderPerformance = ({ query, overview }: AnalyticsTabData) => <PerformanceTab query={query} data={overview} />

export const generateMetadata = () => analyticsPageMetadata('tabs.performance')

export default function PlatformAnalyticsPerformancePage(props: AnalyticsPageProps) {
  return <AnalyticsPage {...props} activeTab="performance" renderTab={renderPerformance} />
}
