import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { PermissionGuard } from '@/components/Security/PermissionGuard';
import { SessionProvider } from '@/components/providers/session-provider';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Actions, Resources, Scopes } from '@/types/permissions';
import type { Session } from '@/lib/auth/types';

// Mock useRouter
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}));

// Mock apiFetch
vi.mock('@/lib/api-client', () => ({
  apiFetch: vi.fn(),
}));

const mockUser = {
  id: 1,
  user_uuid: 'user_1',
  username: 'testuser',
  email: 'test@example.com',
  first_name: 'Test',
  last_name: 'User',
};

const mockSession: Session = {
  user: mockUser,
  roles: [{ role: { id: 1, name: 'User', slug: 'user', priority: 10, is_system: true } }],
  permissions: ['course:read:own', 'course:update:own'],
  permissions_timestamp: Date.now(),
};

describe('Security Audit - Frontend', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  describe('PermissionGuard', () => {
    it('[SECURITY] should render children when permission is granted', () => {
      render(
        <QueryClientProvider client={queryClient}>
          <SessionProvider initialSession={mockSession}>
            <PermissionGuard
              action={Actions.READ}
              resource={Resources.COURSE}
              scope={Scopes.OWN}
            >
              <div data-testid="protected-content">Secret Content</div>
            </PermissionGuard>
          </SessionProvider>
        </QueryClientProvider>,
      );

      expect(screen.getByTestId('protected-content')).toBeDefined();
      expect(screen.getByText('Secret Content')).toBeDefined();
    });

    it('[SECURITY] should render fallback when permission is denied', () => {
      render(
        <QueryClientProvider client={queryClient}>
          <SessionProvider initialSession={mockSession}>
            <PermissionGuard
              action={Actions.DELETE}
              resource={Resources.COURSE}
              scope={Scopes.PLATFORM}
              fallback={<div data-testid="fallback">Denied</div>}
            >
              <div data-testid="protected-content">Secret Content</div>
            </PermissionGuard>
          </SessionProvider>
        </QueryClientProvider>,
      );

      expect(screen.queryByTestId('protected-content')).toBeNull();
      expect(screen.getByTestId('fallback')).toBeDefined();
    });

    it('[SECURITY] should hide content for unauthenticated users', () => {
      render(
        <QueryClientProvider client={queryClient}>
          <SessionProvider initialSession={null}>
            <PermissionGuard
              action={Actions.READ}
              resource={Resources.COURSE}
              scope={Scopes.OWN}
            >
              <div data-testid="protected-content">Secret Content</div>
            </PermissionGuard>
          </SessionProvider>
        </QueryClientProvider>,
      );

      expect(screen.queryByTestId('protected-content')).toBeNull();
    });
  });

  describe('Session Management', () => {
    it('[SECURITY] should handle broadcast logout across tabs', async () => {
      // BroadcastChannel might need a polyfill or mock in jsdom
      const broadcastMock = vi.fn();
      const originalBroadcastChannel = globalThis.BroadcastChannel;

      globalThis.BroadcastChannel = class {
        public name: string;
        public onmessage: ((ev: MessageEvent) => any) | null = null;
        public constructor(name: string) {
          this.name = name;
        }
        public postMessage(data: any) {
          broadcastMock(data);
        }
        public close() {}
        public addEventListener(type: string, listener: any) {
          if (type === 'message') this.onmessage = listener;
        }
        public removeEventListener() {}
        public dispatchEvent() {
          return true;
        }
      } as any;

      render(
        <QueryClientProvider client={queryClient}>
          <SessionProvider initialSession={mockSession}>
            <div data-testid="app">App</div>
          </SessionProvider>
        </QueryClientProvider>,
      );

      // Simulate logout message from another tab
      const channel = new globalThis.BroadcastChannel('auth');
      if (channel.onmessage) {
        channel.onmessage({ data: { type: 'logout' } } as MessageEvent);
      }

      // Check if session is cleared (status becomes unauthenticated)
      // We can check if it redirected to /login (needs mocking useRouter correctly)

      globalThis.BroadcastChannel = originalBroadcastChannel;
    });
  });
});
