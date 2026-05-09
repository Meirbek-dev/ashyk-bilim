import { describe, it, expect } from 'vitest';
import {
  canSeePlatform,
  canSeeCourses,
  canSeeAssignments,
  canSeeAnalytics,
  canSeeUsers,
  canSeeAdmin,
  canAccessDashboard,
} from '@/lib/rbac/navigation-policy';

describe('Navigation Policy', () => {
  const mockCan = (grantedPermissions: Set<string>) => {
    return (resource: string, action: string, scope: string) => {
      return grantedPermissions.has(`${resource}:${action}:${scope}`);
    };
  };

  describe('canSeePlatform', () => {
    it('should return true if user has platform:manage:own', () => {
      const can = mockCan(new Set(['platform:manage:own']));
      expect(canSeePlatform(can)).toBe(true);
    });

    it('should return true if user has platform:update:platform', () => {
      const can = mockCan(new Set(['platform:update:platform']));
      expect(canSeePlatform(can)).toBe(true);
    });

    it('should return false if user lacks platform permissions', () => {
      const can = mockCan(new Set(['course:read:all']));
      expect(canSeePlatform(can)).toBe(false);
    });
  });

  describe('canSeeCourses', () => {
    it('should return true if user has course:create:platform', () => {
      const can = mockCan(new Set(['course:create:platform']));
      expect(canSeeCourses(can)).toBe(true);
    });

    it('should return false if user only has course:read:all', () => {
      const can = mockCan(new Set(['course:read:all']));
      expect(canSeeCourses(can)).toBe(false);
    });
  });

  describe('canSeeAssignments', () => {
    it('should return true if user can grade assignments', () => {
      const can = mockCan(new Set(['assignment:grade:platform']));
      expect(canSeeAssignments(can)).toBe(true);
    });

    it('should return true if user has course:update:own', () => {
      const can = mockCan(new Set(['course:update:own']));
      expect(canSeeAssignments(can)).toBe(true);
    });
  });

  describe('canSeeAnalytics', () => {
    it('should return true for analytics:read:assigned', () => {
      const can = mockCan(new Set(['analytics:read:assigned']));
      expect(canSeeAnalytics(can)).toBe(true);
    });

    it('should return true for analytics:export:all', () => {
      const can = mockCan(new Set(['analytics:export:all']));
      expect(canSeeAnalytics(can)).toBe(true);
    });
  });

  describe('canSeeUsers', () => {
    it('should return true if user can read users on platform', () => {
      const can = mockCan(new Set(['user:read:platform']));
      expect(canSeeUsers(can)).toBe(true);
    });

    it('should return true if user can manage usergroups', () => {
      const can = mockCan(new Set(['usergroup:manage:platform']));
      expect(canSeeUsers(can)).toBe(true);
    });
  });

  describe('canSeeAdmin', () => {
    it('should return true if user can manage roles', () => {
      const can = mockCan(new Set(['role:update:platform']));
      expect(canSeeAdmin(can)).toBe(true);
    });

    it('should return true if user can manage platform', () => {
      const can = mockCan(new Set(['platform:manage:platform']));
      expect(canSeeAdmin(can)).toBe(true);
    });
  });

  describe('canAccessDashboard', () => {
    it('should return true if user can see any dashboard sub-section', () => {
      const canCourses = mockCan(new Set(['course:create:platform']));
      expect(canAccessDashboard(canCourses)).toBe(true);

      const canAnalytics = mockCan(new Set(['analytics:read:assigned']));
      expect(canAccessDashboard(canAnalytics)).toBe(true);
    });

    it('should return false if user has no navigation permissions', () => {
      const can = mockCan(new Set(['course:read:own', 'activity:submit:assigned']));
      expect(canAccessDashboard(can)).toBe(false);
    });
  });
});
