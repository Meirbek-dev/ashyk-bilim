/** @vitest-environment jsdom */
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { SessionProvider, useSessionContext } from '@/components/providers/session-provider';
import React from 'react';
import type { Session } from '@/lib/auth/types';

// Mock useRouter
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: vi.fn(),
    push: vi.fn(),
  }),
}));

// Mock react-query client access
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    clear: vi.fn(),
  }),
}));

const mockSession: Session = {
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
  permissions: ['course:read:own', 'course:create:platform'],
  permissions_timestamp: 123_456_789,
  expires_at: 9_999_999_999,
  session_version: 1,
  expiresAt: 9_999_999_999_000,
  sessionVersion: 1,
};

describe('SessionProvider & useSession', () => {
  it('should provide authentication status and user data', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <SessionProvider initialSession={mockSession}>{children}</SessionProvider>
    );

    const { result } = renderHook(() => useSessionContext(), { wrapper });

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.status).toBe('authenticated');
    expect(result.current.user?.id).toBe(1);
    expect(result.current.user?.email).toBe('test@example.com');
  });

  it('should correctly check permissions via can()', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <SessionProvider initialSession={mockSession}>{children}</SessionProvider>
    );

    const { result } = renderHook(() => useSessionContext(), { wrapper });

    expect(result.current.can('course', 'read', 'own')).toBe(true);
    expect(result.current.can('course', 'create', 'platform')).toBe(true);
    expect(result.current.can('course', 'delete', 'platform')).toBe(false);
  });

  it('should support wildcard permissions (*)', () => {
    const adminSession: Session = {
      ...mockSession,
      permissions: ['*'],
    };

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <SessionProvider initialSession={adminSession}>{children}</SessionProvider>
    );

    const { result } = renderHook(() => useSessionContext(), { wrapper });

    expect(result.current.can('any' as any, 'any' as any, 'any' as any)).toBe(true);
  });

  it('should return unauthenticated when no session is provided', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <SessionProvider initialSession={null}>{children}</SessionProvider>
    );

    const { result } = renderHook(() => useSessionContext(), { wrapper });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.status).toBe('unauthenticated');
    expect(result.current.can('course', 'read', 'own')).toBe(false);
  });
});
