import AdminTab from '@components/Dashboard/Analytics/AdminTab'
import AnalyticsPage from '../_components/AnalyticsPage'
import type { AnalyticsPageProps, AnalyticsTabData } from '../_components/AnalyticsPage'

const renderAdmin = ({ adminData }: AnalyticsTabData) => adminData && <AdminTab adminData={adminData} />

export default function PlatformAnalyticsAdminPage(props: AnalyticsPageProps) {
  return <AnalyticsPage {...props} activeTab="admin" renderTab={renderAdmin} requireAdmin />
}
