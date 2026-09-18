import { describe, it, expect } from 'vite-plus/test'
import {
  canSeeCourses,
  canSeeAnalytics,
  canSeeUsers,
  canSeeAdmin,
  canAccessDashboard,
  canExportAnalytics,
} from '@/lib/rbac/navigation-policy'

describe('Navigation Policy', () => {
  const mockCan = (grantedPermissions: Set<string>) => {
    return (resource: string, action: string, scope: string) => {
      return grantedPermissions.has(`${resource}:${action}:${scope}`)
    }
  }

  describe('canSeeCourses', () => {
    it('should return true if user has course:create:platform', () => {
      const can = mockCan(new Set(['course:create:platform']))
      expect(canSeeCourses(can)).toBe(true)
    })

    it('should return true if user has course:update:own', () => {
      const can = mockCan(new Set(['course:update:own']))
      expect(canSeeCourses(can)).toBe(true)
    })

    it('should return true if user can grade assessments', () => {
      const can = mockCan(new Set(['assessment:grade:platform']))
      expect(canSeeCourses(can)).toBe(true)
    })

    it('should return false if user only has course:read:all', () => {
      const can = mockCan(new Set(['course:read:all']))
      expect(canSeeCourses(can)).toBe(false)
    })
  })

  describe('canSeeAnalytics', () => {
    it('should return true for analytics:read:assigned', () => {
      const can = mockCan(new Set(['analytics:read:assigned']))
      expect(canSeeAnalytics(can)).toBe(true)
    })

    it('should return true for analytics:export:all', () => {
      const can = mockCan(new Set(['analytics:export:all']))
      expect(canSeeAnalytics(can)).toBe(true)
    })

    // UX-114: the export buttons need the export grant, not just read.
    it('canExportAnalytics is false for a read-only grant', () => {
      expect(canExportAnalytics(mockCan(new Set(['analytics:read:assigned'])))).toBe(false)
      expect(canExportAnalytics(mockCan(new Set(['analytics:export:assigned'])))).toBe(true)
    })
  })

  describe('canAccessDashboard', () => {
    it('should return true for a learner who can submit assessments', () => {
      // The dashboard root always renders the caller's own work queue.
      const can = mockCan(new Set(['assessment:submit:assigned']))
      expect(canAccessDashboard(can)).toBe(true)
    })

    it('should return false for a guest with no submit or admin grants', () => {
      const can = mockCan(new Set(['course:read:all']))
      expect(canAccessDashboard(can)).toBe(false)
    })
  })

  describe('canSeeUsers', () => {
    it('should return false for a learner holding only user:read:platform', () => {
      // Every learner has this grant (public profiles). The admin directory
      // behind the nav entry needs platform:read:platform and answers 403.
      const can = mockCan(new Set(['user:read:platform']))
      expect(canSeeUsers(can)).toBe(false)
    })

    it('should return true if user can read the platform directory', () => {
      const can = mockCan(new Set(['platform:read:platform']))
      expect(canSeeUsers(can)).toBe(true)
    })

    it('should return true for a teacher who can read usergroups on platform', () => {
      const can = mockCan(new Set(['usergroup:read:platform']))
      expect(canSeeUsers(can)).toBe(true)
    })

    it('should return true if user can manage usergroups', () => {
      const can = mockCan(new Set(['usergroup:manage:platform']))
      expect(canSeeUsers(can)).toBe(true)
    })
  })

  describe('canSeeAdmin', () => {
    it('should return true if user can manage roles', () => {
      const can = mockCan(new Set(['role:update:platform']))
      expect(canSeeAdmin(can)).toBe(true)
    })

    it('should return true if user can manage platform', () => {
      const can = mockCan(new Set(['platform:manage:platform']))
      expect(canSeeAdmin(can)).toBe(true)
    })
  })

  describe('canAccessDashboard', () => {
    it('should return true if user can see any dashboard sub-section', () => {
      const canCourses = mockCan(new Set(['course:create:platform']))
      expect(canAccessDashboard(canCourses)).toBe(true)

      const canAnalytics = mockCan(new Set(['analytics:read:assigned']))
      expect(canAccessDashboard(canAnalytics)).toBe(true)
    })

    it('should return false if user has no navigation permissions', () => {
      const can = mockCan(new Set(['course:read:own', 'activity:submit:assigned']))
      expect(canAccessDashboard(can)).toBe(false)
    })
  })
})
