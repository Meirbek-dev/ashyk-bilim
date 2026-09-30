/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vite-plus/test'
import { render, screen, waitFor, within, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import UserSecuritySettings from '@/components/Dashboard/Pages/UserAccount/UserSecuritySettings/UserSecuritySettings'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useFormatter: () => ({ dateTime: (date: Date) => date.toISOString() }),
}))

const toastInfo = vi.fn()
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: (...args: unknown[]) => toastInfo(...args) },
}))

vi.mock('@/hooks/useApiError', () => ({
  useApiError: () => ({ toastApiError: vi.fn() }),
}))

const mockListSessions = vi.fn()
const mockChangePassword = vi.fn()
const mockRemoveTotp = vi.fn()
const mockRevokeSession = vi.fn()
const mockGetSessionInfo = vi.fn()
const mockStartTotpEnrollment = vi.fn()
const mockVerifyTotpEnrollment = vi.fn()
vi.mock('@services/auth/auth', () => ({
  changePassword: (...args: unknown[]) => mockChangePassword(...args),
  getSessionInfo: (...args: unknown[]) => mockGetSessionInfo(...args),
  listSessions: (...args: unknown[]) => mockListSessions(...args),
  removeTotp: (...args: unknown[]) => mockRemoveTotp(...args),
  revokeSession: (...args: unknown[]) => mockRevokeSession(...args),
  startTotpEnrollment: (...args: unknown[]) => mockStartTotpEnrollment(...args),
  verifyTotpEnrollment: (...args: unknown[]) => mockVerifyTotpEnrollment(...args),
}))

const sessionInfo = (mfa_enabled: boolean) => ({
  session_id: 's1',
  user_id: 'u1',
  roles: ['user'],
  permissions: [],
  mfa_enabled,
})

describe('UserSecuritySettings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetSessionInfo.mockImplementation(() => Promise.resolve(sessionInfo(false)))
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
    mockGetSessionInfo.mockResolvedValue(sessionInfo(true))
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <UserSecuritySettings mfaEnabled />
      </QueryClientProvider>,
    )
    expect(await screen.findByText('disableTotp')).toBeDefined()
    expect(screen.queryByText('enableTotp')).toBeNull()
  })

  // UX-188: a Google-only account has no password to change, and TOTP does
  // not guard its Google sign-in — say so instead of offering the form.
  it('shows a Google-only account no change-password form and the Google TOTP note', async () => {
    mockListSessions.mockResolvedValue([])
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <UserSecuritySettings hasPassword={false} googleLinked />
      </QueryClientProvider>,
    )
    expect(await screen.findByText('passwordNotSet')).toBeDefined()
    expect(document.querySelector('input[name="currentPassword"]')).toBeNull()
    expect(screen.queryByText('changePassword')).toBeNull()
    expect(screen.getByText('totpGoogleNote')).toBeDefined()
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
    await user.type(input('newPassword'), 'New horse battery 1')
    await user.type(input('confirmPassword'), 'New horse battery 1')
    await user.click(screen.getByRole('button', { name: 'changePassword' }))
    await waitFor(() => expect(mockChangePassword).toHaveBeenCalledWith('old horse', 'New horse battery 1'))
    expect(await screen.findByText('currentPasswordWrong')).toBeDefined()

    await user.click(screen.getByRole('button', { name: 'changePassword' }))
    await waitFor(() => expect(mockChangePassword).toHaveBeenCalledTimes(2))
    // Success clears the form.
    await waitFor(() => expect(input('currentPassword').value).toBe(''))
    // UX-017: the server revoked the other sessions — the list refetches.
    await waitFor(() => expect(mockListSessions).toHaveBeenCalledTimes(2))
  })

  // UX-018: «Disable» removed TOTP on the spot; revoke-session asks first.
  it('asks for confirmation before disabling TOTP', async () => {
    mockListSessions.mockResolvedValue([])
    mockGetSessionInfo.mockResolvedValue(sessionInfo(true))
    mockRemoveTotp.mockImplementation(() => {
      mockGetSessionInfo.mockResolvedValue(sessionInfo(false))
      return Promise.resolve(undefined)
    })
    const user = userEvent.setup()
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <UserSecuritySettings mfaEnabled />
      </QueryClientProvider>,
    )
    await user.click(await screen.findByRole('button', { name: 'disableTotp' }))
    expect(await screen.findByText('disableTotpConfirmTitle')).toBeDefined()
    expect(mockRemoveTotp).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'cancel' }))
    await waitFor(() => expect(screen.queryByText('disableTotpConfirmTitle')).toBeNull())
    expect(mockRemoveTotp).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'disableTotp' }))
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'disableTotp' }))
    await waitFor(() => expect(mockRemoveTotp).toHaveBeenCalledTimes(1))
    expect(await screen.findByText('enableTotp')).toBeDefined()
    // UX-055: the trigger unmounted with the dialog — focus lands on the
    // section heading, not <body>.
    await waitFor(() => expect(document.activeElement?.id).toBe('totp-heading'))
  })

  // UX-082: a session ended elsewhere → DELETE 404 was a generic «not
  // found» toast and the dead row stayed until a reload.
  it('drops a session row that had already ended elsewhere', async () => {
    const { APIError } = await import('@/lib/api/assertSuccess')
    const row = { handle: 'abcd', current: false, created_at_unix: 0, last_seen_unix: 0, ip: null, user_agent: null }
    mockListSessions
      .mockResolvedValueOnce([{ ...row, current: true, handle: 'me' }, row])
      .mockResolvedValue([{ ...row, current: true, handle: 'me' }])
    mockRevokeSession.mockRejectedValue(new APIError({ code: 'not-found', message: 'gone', status: 404 }))
    const user = userEvent.setup()
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <UserSecuritySettings />
      </QueryClientProvider>,
    )
    await user.click(await screen.findByRole('button', { name: 'revoke' }))
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'revoke' }))
    await waitFor(() => expect(toastInfo).toHaveBeenCalledWith('sessionAlreadyEnded'))
    await waitFor(() => expect(mockListSessions).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'revoke' })).toBeNull())
  })

  // UX-082: TOTP disabled in another tab — the server snapshot said
  // «enabled»; the live session flag wins once it arrives.
  it('reflects a TOTP disable made in another tab from the live session', async () => {
    mockListSessions.mockResolvedValue([])
    mockGetSessionInfo.mockResolvedValue(sessionInfo(false))
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <UserSecuritySettings mfaEnabled />
      </QueryClientProvider>,
    )
    expect(await screen.findByText('enableTotp')).toBeDefined()
    expect(screen.queryByText('disableTotp')).toBeNull()
  })

  // UX-110: the enrolment was activated in another tab — verify's 409 is the
  // same «already active» re-sync as enrol's, not a generic conflict toast.
  it('re-syncs to the active state when verify answers 409', async () => {
    const { APIError } = await import('@/lib/api/assertSuccess')
    mockListSessions.mockResolvedValue([])
    mockStartTotpEnrollment.mockResolvedValue({ secret: 'ABC', uri: 'otpauth://x' })
    mockVerifyTotpEnrollment.mockRejectedValue(new APIError({ code: 'conflict', message: 'active', status: 409 }))
    mockGetSessionInfo.mockResolvedValueOnce(sessionInfo(false)).mockResolvedValue(sessionInfo(true))
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const user = userEvent.setup()
    render(
      <QueryClientProvider client={queryClient}>
        <UserSecuritySettings />
      </QueryClientProvider>,
    )
    await user.click(await screen.findByText('enableTotp'))
    await user.type(await screen.findByRole('textbox'), '123456')
    await user.keyboard('{Enter}')
    await waitFor(() => expect(toastInfo).toHaveBeenCalledWith('totpAlreadyActive'))
    expect(await screen.findByText('disableTotp')).toBeDefined()
    expect(screen.queryByText('totpScanHint')).toBeNull()
  })

  // UX-118: the same 409 when the pending enrolment was removed elsewhere —
  // the refetched flag says «not enabled», so the section goes back to
  // «Включить…» with a «start again» notice, not «already active».
  it('resets the enrolment when verify answers 409 and mfa is still off', async () => {
    const { APIError } = await import('@/lib/api/assertSuccess')
    mockListSessions.mockResolvedValue([])
    mockStartTotpEnrollment.mockResolvedValue({ secret: 'ABC', uri: 'otpauth://x' })
    mockVerifyTotpEnrollment.mockRejectedValue(new APIError({ code: 'conflict', message: 'not started', status: 409 }))
    mockGetSessionInfo.mockResolvedValue(sessionInfo(false))
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const user = userEvent.setup()
    render(
      <QueryClientProvider client={queryClient}>
        <UserSecuritySettings />
      </QueryClientProvider>,
    )
    await user.click(await screen.findByText('enableTotp'))
    await user.type(await screen.findByRole('textbox'), '123456')
    await user.keyboard('{Enter}')
    await waitFor(() => expect(toastInfo).toHaveBeenCalledWith('totpEnrollmentReset'))
    expect(toastInfo).not.toHaveBeenCalledWith('totpAlreadyActive')
    expect(await screen.findByText('enableTotp')).toBeDefined()
    expect(screen.queryByText('totpScanHint')).toBeNull()
  })

  // UX-107: the app default is `refetchOnWindowFocus: false`, so `staleTime: 5 s`
  // alone never refetched — a session revoked in another tab stayed listed.
  it('refetches the sessions list on window focus', async () => {
    mockListSessions.mockResolvedValue([])
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <UserSecuritySettings />
      </QueryClientProvider>,
    )
    await waitFor(() => expect(mockListSessions).toHaveBeenCalledTimes(1))
    const query = queryClient.getQueryCache().find({ queryKey: ['auth', 'sessions'] })
    expect(query?.options).toMatchObject({ staleTime: 5_000, refetchOnWindowFocus: true })
  })
})
