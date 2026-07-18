import PerformanceTab from '@components/Dashboard/Analytics/PerformanceTab'
import AnalyticsPage from '../_components/AnalyticsPage'
import type { AnalyticsPageProps, AnalyticsTabData } from '../_components/AnalyticsPage'

const renderPerformance = ({ query, overview }: AnalyticsTabData) => <PerformanceTab query={query} data={overview} />

export default function PlatformAnalyticsPerformancePage(props: AnalyticsPageProps) {
  return <AnalyticsPage {...props} activeTab="performance" renderTab={renderPerformance} />
}
