/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vite-plus/test'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
const mockChangePassword = vi.fn()
vi.mock('@services/auth/auth', () => ({
  changePassword: (...args: unknown[]) => mockChangePassword(...args),
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

  // DECISIONS 2026-09-12 (Q-7): `mfa_enabled` arrives with the profile, so
  // an enrolled account renders the disable control on first paint instead
  // of after a 409 from a probing enrol call.
  it('renders the enrolled state from mfa_enabled without probing the API', async () => {
    mockListSessions.mockResolvedValue([])
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <UserSecuritySettings mfaEnabled />
      </QueryClientProvider>,
    )
    expect(await screen.findByText('disableTotp')).toBeDefined()
    expect(screen.queryByText('enableTotp')).toBeNull()
  })

  it('changes the password through the BFF and maps invalid-credentials onto the current field', async () => {
    mockListSessions.mockResolvedValue([])
    const { APIError } = await import('@/lib/api/assertSuccess')
    mockChangePassword.mockRejectedValueOnce(
      new APIError({ code: 'invalid-credentials', message: 'nope', status: 401 }),
    )
    mockChangePassword.mockResolvedValueOnce(undefined)
    const user = userEvent.setup()
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <UserSecuritySettings />
      </QueryClientProvider>,
    )
    const input = (name: string) => document.querySelector<HTMLInputElement>(`input[name="${name}"]`)!

    // Local validation first: nothing leaves the browser.
    await user.click(screen.getByRole('button', { name: 'changePassword' }))
    expect(await screen.findByText('passwordTooShort')).toBeDefined()
    expect(mockChangePassword).not.toHaveBeenCalled()

    await user.type(input('currentPassword'), 'old horse')
    await user.type(input('newPassword'), 'new horse battery')
    await user.type(input('confirmPassword'), 'new horse battery')
    await user.click(screen.getByRole('button', { name: 'changePassword' }))
    await waitFor(() => expect(mockChangePassword).toHaveBeenCalledWith('old horse', 'new horse battery'))
    expect(await screen.findByText('currentPasswordWrong')).toBeDefined()

    await user.click(screen.getByRole('button', { name: 'changePassword' }))
    await waitFor(() => expect(mockChangePassword).toHaveBeenCalledTimes(2))
    // Success clears the form.
    await waitFor(() => expect(input('currentPassword').value).toBe(''))
  })
})
