import {
  canAccessDashboard,
  canSeeAdmin,
  canSeeAnalytics,
  canSeeCourses,
  canSeePlatform,
  canSeeUsers,
} from '@/lib/rbac/navigation-policy'
import { useSession } from '@/hooks/useSession'

export function useNavigationPermissions() {
  const { can } = useSession()

  const hasPlatformAccess = canSeePlatform(can)
  const hasCoursesAccess = canSeeCourses(can)
  const hasAnalyticsAccess = canSeeAnalytics(can)
  const hasUsersAccess = canSeeUsers(can)
  const hasAdminAccess = canSeeAdmin(can)
  const hasDashboardAccess = canAccessDashboard(can)

  return {
    canSeeCourses: hasCoursesAccess,
    canSeeAnalytics: hasAnalyticsAccess,
    canSeeUsers: hasUsersAccess,
    canSeeAdmin: hasAdminAccess,
    canSeePlatform: hasPlatformAccess,
    canAccessDashboard: hasDashboardAccess,
  }
}
