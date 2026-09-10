/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vite-plus/test'
import { render, screen, cleanup } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { APIError } from '@/lib/api/assertSuccess'
import Users from '@/components/Dashboard/Pages/Users/Users/Users'

// Users.tsx pulls in `@/services/platform/platform` (for `removeUser`),
// which imports the server-only `requireSession` — neutralize the
// `server-only` guard the same way tests/auth/auth-pipeline.test.ts does.
vi.mock('server-only', () => ({}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@/hooks/useSession', () => ({
  useSession: () => ({
    session: { roles: ['user'], permissions: [] },
    user: { id: 'u1' },
    can: () => false,
  }),
}))

const mockUseAllMembers = vi.fn()
vi.mock('@/features/users/hooks/useUsers', () => ({
  useAllMembers: () => mockUseAllMembers(),
  useRoles: () => ({ data: [] }),
}))

describe('Users page (BUG-007: a 403 must not render as "no results")', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('shows a "no access" state instead of the empty-results table on a 403', () => {
    mockUseAllMembers.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new APIError({ message: 'missing permission platform:read:platform', status: 403, code: 'forbidden' }),
    })

    render(
      <QueryClientProvider client={new QueryClient()}>
        <Users />
      </QueryClientProvider>,
    )

    expect(screen.getByText('accessDenied')).toBeDefined()
    expect(screen.queryByText('noUsersFound')).toBeNull()
  })

  it('still shows the genuine empty state when the list legitimately has no users', () => {
    mockUseAllMembers.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
    })

    render(
      <QueryClientProvider client={new QueryClient()}>
        <Users />
      </QueryClientProvider>,
    )

    expect(screen.queryByText('accessDenied')).toBeNull()
  })
})
