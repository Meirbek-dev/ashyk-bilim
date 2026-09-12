import OperationsTab from '@components/Dashboard/Analytics/OperationsTab'
import AnalyticsPage from '../_components/AnalyticsPage'
import { analyticsPageMetadata } from '../_components/metadata'
import type { AnalyticsPageProps, AnalyticsTabData } from '../_components/AnalyticsPage'

const renderOperations = ({ query, overview }: AnalyticsTabData) => <OperationsTab query={query} data={overview} />

export const generateMetadata = () => analyticsPageMetadata('tabs.operations')

export default function PlatformAnalyticsOperationsPage(props: AnalyticsPageProps) {
  return <AnalyticsPage {...props} activeTab="operations" renderTab={renderOperations} />
}
