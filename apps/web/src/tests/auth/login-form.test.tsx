/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from 'vite-plus/test'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import LoginClient from '@/app/[locale]/auth/login/login'

vi.mock('next-intl', () => ({
  useTranslations: () =>
    Object.assign((key: string, values?: Record<string, unknown>) => (values ? `${key}:${JSON.stringify(values)}` : key), {
      has: () => false,
    }),
  useLocale: () => 'ru-RU',
}))
let searchParams = new URLSearchParams()
vi.mock('next/navigation', () => ({ useSearchParams: () => searchParams }))
vi.mock('@services/config/config', () => ({ getAbsoluteUrl: (p: string) => p, getPublicAPIUrl: () => '/api/v2/' }))
vi.mock('@components/ui/AppLink', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}))
vi.mock('@components/auth/logo', () => ({ default: () => null }))
vi.mock('@components/auth/card', () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }))

const loginAction = vi.fn()
vi.mock('@/app/actions/auth', () => ({ loginAction: (...args: unknown[]) => loginAction(...args) }))

const input = (name: string) => document.querySelector<HTMLInputElement>(`input[name="${name}"]`)

beforeEach(() => {
  vi.clearAllMocks()
  searchParams = new URLSearchParams()
})

describe('/auth/login', () => {
  // UX-019: «Back to login» on the TOTP step was a Link — the URL changed
  // but the same LoginClient kept `step: 'totp'` until a reload.
  it('returns from the TOTP step to the credentials form', async () => {
    loginAction.mockResolvedValue({ ok: false, reason: 'mfa_required', code: 'mfa-required' })
    const user = userEvent.setup()
    render(<LoginClient />)
    await user.type(input('login')!, 'aigerim')
    await user.type(input('password')!, 'correct horse')
    await user.click(screen.getByRole('button', { name: 'login' }))
    await waitFor(() => expect(input('totpCode')).not.toBeNull())
    expect(input('login')).toBeNull()

    await user.click(screen.getByRole('button', { name: 'backToPassword' }))
    await waitFor(() => expect(input('login')).not.toBeNull())
    expect(input('totpCode')).toBeNull()
    expect(input('login')!.value).toBe('aigerim')
    expect(loginAction).toHaveBeenCalledTimes(1)
  })

  // UX-055: a Google `?error=` banner outlived the password step and sat
  // above the one-time-code field as if the code had failed.
  it('drops the redirect error banner once the TOTP step opens', async () => {
    searchParams = new URLSearchParams('error=google-cancelled')
    loginAction.mockResolvedValue({ ok: false, reason: 'mfa_required', code: 'mfa-required' })
    const user = userEvent.setup()
    render(<LoginClient />)
    expect(screen.getByText('googleCancelled')).toBeDefined()
    await user.type(input('login')!, 'aigerim')
    await user.type(input('password')!, 'correct horse')
    await user.click(screen.getByRole('button', { name: 'login' }))
    await waitFor(() => expect(input('totpCode')).not.toBeNull())
    expect(screen.queryByText('googleCancelled')).toBeNull()
  })

  // UX-083: an empty submit left «required» under both fields; filling them
  // and submitting again kept the stale errors for the whole pending window.
  it('clears field errors while the next submit is pending', async () => {
    let settle: (value: unknown) => void = () => {}
    loginAction.mockImplementation(() => new Promise(resolve => (settle = resolve)))
    const user = userEvent.setup()
    render(<LoginClient />)
    await user.click(screen.getByRole('button', { name: 'login' }))
    await waitFor(() => expect(screen.getAllByText('required')).toHaveLength(2))

    await user.type(input('login')!, 'aigerim')
    await user.type(input('password')!, 'correct horse')
    await user.click(screen.getByRole('button', { name: 'login' }))
    await waitFor(() => expect(loginAction).toHaveBeenCalledTimes(1))
    expect(screen.queryByText('required')).toBeNull()
    settle({ ok: false, reason: 'invalid_credentials', code: 'invalid-credentials' })
    expect(await screen.findByText('wrongCredentials')).toBeDefined()
  })

  // UX-083: the 429 banner names the retry window from `Retry-After`.
  it('tells the user when to retry after a rate limit', async () => {
    loginAction.mockResolvedValue({ ok: false, reason: 'rate_limited', code: 'rate-limited', retryAfterSeconds: 890 })
    const user = userEvent.setup()
    render(<LoginClient />)
    await user.type(input('login')!, 'aigerim')
    await user.type(input('password')!, 'x')
    await user.click(screen.getByRole('button', { name: 'login' }))
    expect(await screen.findByText('rateLimitedRetry:{"minutes":15}')).toBeDefined()
  })
})
