/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vite-plus/test'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import UserSecuritySettings from '@/components/Dashboard/Pages/UserAccount/UserSecuritySettings/UserSecuritySettings'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useFormatter: () => ({ dateTime: (date: Date) => date.toISOString() }),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

vi.mock('@/hooks/useApiError', () => ({
  useApiError: () => ({ toastApiError: vi.fn() }),
}))

const mockListSessions = vi.fn()
vi.mock('@services/auth/auth', () => ({
  listSessions: (...args: unknown[]) => mockListSessions(...args),
  removeTotp: vi.fn(),
  revokeSession: vi.fn(),
  startTotpEnrollment: vi.fn(),
  verifyTotpEnrollment: vi.fn(),
}))

describe('UserSecuritySettings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  // UX-002: the sessions query retried with backoff for over a minute
  // against an unreachable API, showing an unlabelled spinner the whole
  // time before `sessionsLoadError` (and its retry button) ever rendered.
  it('shows the sessions error state within a few seconds instead of retrying for a minute', async () => {
    mockListSessions.mockRejectedValue(new Error('network unreachable'))
    // Deliberately the bare library default (3 attempts, exponential
    // backoff up to ~7s) rather than this app's own queryClient.ts default
    // (3 attempts, 5s each) — either way, slower than the few-second bound
    // this test enforces unless UserSecuritySettings caps retries itself.
    const queryClient = new QueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <UserSecuritySettings />
      </QueryClientProvider>,
    )

    await waitFor(() => expect(screen.getByText('sessionsLoadError')).toBeDefined(), { timeout: 2500 })
    // The retry button must still be there — capping retries must not
    // remove the escape hatch.
    expect(screen.getByText('retry')).toBeDefined()
  })

  // UX-003: "Enable" and "Disable" both rendered for an account with no
  // TOTP enrolled, making "Disable" a dead click (and, since removal is
  // idempotent, a misleading one — it would toast success without having
  // disabled anything).
  it('renders only the enable control for an account with no TOTP enrolled', async () => {
    mockListSessions.mockResolvedValue([])
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    render(
      <QueryClientProvider client={queryClient}>
        <UserSecuritySettings />
      </QueryClientProvider>,
    )

    expect(await screen.findByText('enableTotp')).toBeDefined()
    expect(screen.queryByText('disableTotp')).toBeNull()
  })
})
