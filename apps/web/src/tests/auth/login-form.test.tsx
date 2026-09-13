/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from 'vite-plus/test'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import LoginClient from '@/app/[locale]/auth/login/login'

vi.mock('next-intl', () => ({
  useTranslations: () => Object.assign((key: string) => key, { has: () => false }),
  useLocale: () => 'ru-RU',
}))
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }))
vi.mock('@services/config/config', () => ({ getAbsoluteUrl: (p: string) => p, getPublicAPIUrl: () => '/api/v2/' }))
vi.mock('@components/ui/AppLink', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}))
vi.mock('@components/auth/logo', () => ({ default: () => null }))
vi.mock('@components/auth/card', () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }))

const loginAction = vi.fn()
vi.mock('@/app/actions/auth', () => ({ loginAction: (...args: unknown[]) => loginAction(...args) }))

const input = (name: string) => document.querySelector<HTMLInputElement>(`input[name="${name}"]`)

beforeEach(() => vi.clearAllMocks())

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
})
