import { useQuery } from '@tanstack/react-query'

import {
  canAccessDashboard,
  canSeeAdmin,
  canSeeAnalytics,
  canSeeCourses,
  canSeeUsers,
} from '@/lib/rbac/navigation-policy'
import { useSession } from '@/hooks/useSession'
import { getListCoursesQueryOptions } from '@/lib/api/generated/courses/courses'

export function useNavigationPermissions() {
  const { can, isAuthenticated } = useSession()

  const roleSeesCourses = canSeeCourses(can)
  // Authorship is the `:own` scope: a plain `user`-role co-author has no
  // course grant but still owns a workspace. One cheap `mine=true` probe
  // (the `summary` block) only for sessions the role check rejects.
  const { data: mine } = useQuery({
    ...getListCoursesQueryOptions({ mine: true, limit: 1 }),
    enabled: isAuthenticated && !roleSeesCourses,
    staleTime: 5 * 60_000,
  })
  const hasCoursesAccess = roleSeesCourses || (mine?.summary?.total ?? 0) > 0
  const hasAnalyticsAccess = canSeeAnalytics(can)
  const hasUsersAccess = canSeeUsers(can)
  const hasAdminAccess = canSeeAdmin(can)
  const hasDashboardAccess = canAccessDashboard(can)

  return {
    canSeeCourses: hasCoursesAccess,
    canSeeAnalytics: hasAnalyticsAccess,
    canSeeUsers: hasUsersAccess,
    canSeeAdmin: hasAdminAccess,
    canAccessDashboard: hasDashboardAccess,
  }
}
