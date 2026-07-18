import OperationsTab from '@components/Dashboard/Analytics/OperationsTab'
import AnalyticsPage from '../_components/AnalyticsPage'
import type { AnalyticsPageProps, AnalyticsTabData } from '../_components/AnalyticsPage'

const renderOperations = ({ query, overview }: AnalyticsTabData) => <OperationsTab query={query} data={overview} />

export default function PlatformAnalyticsOperationsPage(props: AnalyticsPageProps) {
  return <AnalyticsPage {...props} activeTab="operations" renderTab={renderOperations} />
}
