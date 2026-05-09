/** @vitest-environment jsdom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { SessionProvider } from '@/components/providers/session-provider';
import { PermissionGuard } from '@/components/Security/PermissionGuard';
import { Actions, Resources, Scopes } from '@/types/permissions';
import {
  canSeePlatform,
  canSeeCourses,
  canSeeAssignments,
  canSeeAnalytics,
  canSeeAdmin,
} from '@/lib/rbac/navigation-policy';
import type { Session } from '@/lib/auth/types';

// Mock useRouter
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: vi.fn(),
    push: vi.fn(),
  }),
}));

// Mock useQuery
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({
    data: null,
    isError: false,
    isLoading: false,
  }),
  useQueryClient: () => ({
    clear: vi.fn(),
  }),
  queryOptions: (opts: any) => opts,
}));

// Mock apiFetch
vi.mock('@/lib/api-client', () => ({
  apiFetch: vi.fn(),
}));

const createMockSession = (permissions: string[]): Session => ({
  user: {
    id: 1,
    user_uuid: 'user-123',
    username: 'testuser',
    email: 'test@example.com',
    first_name: 'Test',
    last_name: 'User',
    middle_name: null,
    avatar_image: null,
    bio: null,
    details: null,
    profile: null,
    theme: null,
  },
  roles: [],
  permissions,
  permissions_timestamp: Date.now(),
  expires_at: Date.now() + 3_600_000,
  session_version: 1,
  expiresAt: Date.now() + 3_600_000,
  sessionVersion: 1,
});

describe('Teacher (Instructor) Workflow', () => {
  const instructorPermissions = [
    'course:read:all',
    'course:update:own',
    'course:create:platform',
    'assignment:grade:own',
    'analytics:read:assigned',
    'chapter:read:all',
    'activity:read:all',
  ];

  const instructorSession = createMockSession(instructorPermissions);

  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <SessionProvider initialSession={instructorSession}>{children}</SessionProvider>
  );

  it('should allow instructor to see courses they created or can manage', () => {
    const mockCan = (r: any, a: any, s: any) => instructorPermissions.includes(`${r}:${a}:${s}`);
    expect(canSeeCourses(mockCan as any)).toBe(true);
  });

  it('should allow instructor to see assignments for their courses', () => {
    const mockCan = (r: any, a: any, s: any) => instructorPermissions.includes(`${r}:${a}:${s}`);
    expect(canSeeAssignments(mockCan as any)).toBe(true);
  });

  it('should allow instructor to see analytics for assigned students', () => {
    const mockCan = (r: any, a: any, s: any) => instructorPermissions.includes(`${r}:${a}:${s}`);
    expect(canSeeAnalytics(mockCan as any)).toBe(true);
  });

  it('should NOT allow instructor to see admin settings', () => {
    const mockCan = (r: any, a: any, s: any) => instructorPermissions.includes(`${r}:${a}:${s}`);
    expect(canSeeAdmin(mockCan as any)).toBe(false);
  });

  it('should NOT allow instructor to manage platform', () => {
    const mockCan = (r: any, a: any, s: any) => instructorPermissions.includes(`${r}:${a}:${s}`);
    expect(canSeePlatform(mockCan as any)).toBe(false);
  });

  describe('PermissionGuard for Instructor', () => {
    it('should render children when instructor has permission', () => {
      render(
        <Wrapper>
          <PermissionGuard
            action={Actions.CREATE}
            resource={Resources.COURSE}
            scope={Scopes.PLATFORM}
          >
            <button data-testid="create-course">Create Course</button>
          </PermissionGuard>
        </Wrapper>,
      );

      expect(screen.getByTestId('create-course')).toBeDefined();
    });

    it('should NOT render children when instructor lacks permission', () => {
      render(
        <Wrapper>
          <PermissionGuard
            action={Actions.DELETE}
            resource={Resources.COURSE}
            scope={Scopes.PLATFORM}
          >
            <button data-testid="delete-course">Delete Course</button>
          </PermissionGuard>
        </Wrapper>,
      );

      expect(screen.queryByTestId('delete-course')).toBeNull();
    });

    it('should render fallback when permission is denied', () => {
      render(
        <Wrapper>
          <PermissionGuard
            action={Actions.DELETE}
            resource={Resources.COURSE}
            scope={Scopes.PLATFORM}
            fallback={<div data-testid="no-access">No Access</div>}
          >
            <button>Delete Course</button>
          </PermissionGuard>
        </Wrapper>,
      );

      expect(screen.getByTestId('no-access')).toBeDefined();
    });

    it('should handle "own" scope correctly', () => {
      render(
        <Wrapper>
          <PermissionGuard
            action={Actions.GRADE}
            resource={Resources.ASSIGNMENT}
            scope={Scopes.OWN}
          >
            <button data-testid="grade-own">Grade My Assignment</button>
          </PermissionGuard>
        </Wrapper>,
      );

      expect(screen.getByTestId('grade-own')).toBeDefined();
    });

    it('should deny "platform" scope if only "own" is granted', () => {
      render(
        <Wrapper>
          <PermissionGuard
            action={Actions.GRADE}
            resource={Resources.ASSIGNMENT}
            scope={Scopes.PLATFORM}
          >
            <button data-testid="grade-all">Grade All Assignments</button>
          </PermissionGuard>
        </Wrapper>,
      );

      expect(screen.queryByTestId('grade-all')).toBeNull();
    });
  });
});

describe('Security Invariants', () => {
  it('should deny everything for unauthenticated users', () => {
    const UnauthWrapper = ({ children }: { children: React.ReactNode }) => (
      <SessionProvider initialSession={null}>{children}</SessionProvider>
    );

    render(
      <UnauthWrapper>
        <PermissionGuard
          action={Actions.READ}
          resource={Resources.COURSE}
          scope={Scopes.OWN}
        >
          <div data-testid="secret">Secret</div>
        </PermissionGuard>
      </UnauthWrapper>,
    );

    expect(screen.queryByTestId('secret')).toBeNull();
  });

  it('should allow everything for super-admins with wildcard (*)', () => {
    const adminSession = createMockSession(['*']);
    const AdminWrapper = ({ children }: { children: React.ReactNode }) => (
      <SessionProvider initialSession={adminSession}>{children}</SessionProvider>
    );

    render(
      <AdminWrapper>
        <PermissionGuard
          action={Actions.MANAGE}
          resource={Resources.ROLE}
          scope={Scopes.PLATFORM}
        >
          <div data-testid="admin-only">Admin Only</div>
        </PermissionGuard>
      </AdminWrapper>,
    );

    expect(screen.getByTestId('admin-only')).toBeDefined();
  });
});
