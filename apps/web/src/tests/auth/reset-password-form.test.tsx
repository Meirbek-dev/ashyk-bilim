/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from 'vite-plus/test'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ResetPasswordClient from '@/app/[locale]/auth/reset-password/reset-password'

vi.mock('next-intl', () => ({
  useTranslations: () => Object.assign((key: string) => key, { has: () => false }),
  useLocale: () => 'kk-KZ',
}))
const push = vi.fn()
vi.mock('@/i18n/navigation', () => ({ useRouter: () => ({ push }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }))
vi.mock('@services/config/config', () => ({ getAbsoluteUrl: (p: string) => p }))
vi.mock('@components/ui/AppLink', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}))
vi.mock('@components/auth/logo', () => ({ default: () => null }))
vi.mock('@components/auth/card', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

const requestPasswordResetAction = vi.fn()
const confirmPasswordResetAction = vi.fn()
vi.mock('@/app/actions/auth', () => ({
  requestPasswordResetAction: (...args: unknown[]) => requestPasswordResetAction(...args),
  confirmPasswordResetAction: (...args: unknown[]) => confirmPasswordResetAction(...args),
}))

const input = (name: string) => document.querySelector<HTMLInputElement>(`input[name="${name}"]`)!
const NEW_PASSWORD = 'Nov-parol1!'

beforeEach(() => vi.clearAllMocks())

describe('/auth/reset-password', () => {
  it('asks for a code, then sets the new password with it and goes to sign-in', async () => {
    requestPasswordResetAction.mockResolvedValue({ ok: true })
    confirmPasswordResetAction.mockResolvedValue({ ok: true })
    const user = userEvent.setup()
    render(<ResetPasswordClient email="" code="" />)

    await user.type(input('login'), 'aigerim.k')
    await user.click(screen.getByRole('button', { name: 'sendCode' }))
    await waitFor(() => expect(input('code')).toBeTruthy())
    expect(requestPasswordResetAction).toHaveBeenCalledWith({ login: 'aigerim.k', locale: 'kk-KZ' })

    await user.type(input('code'), 'abc123')
    await user.type(input('password'), NEW_PASSWORD)
    await user.type(input('confirmPassword'), NEW_PASSWORD)
    await user.click(screen.getByRole('button', { name: 'submit' }))
    await waitFor(() => expect(push).toHaveBeenCalledWith('/auth/login'))
    expect(confirmPasswordResetAction).toHaveBeenCalledWith({
      login: 'aigerim.k',
      code: 'abc123',
      newPassword: NEW_PASSWORD,
    })
  })

  it('opens the code step from the email link and keeps the code after a wrong one', async () => {
    confirmPasswordResetAction.mockResolvedValue({ ok: false, code: 'reset-code-invalid' })
    const user = userEvent.setup()
    render(<ResetPasswordClient email="aigerim@example.com" code="WRONG1" />)

    await user.type(input('password'), NEW_PASSWORD)
    await user.type(input('confirmPassword'), NEW_PASSWORD)
    await user.click(screen.getByRole('button', { name: 'submit' }))
    await waitFor(() => expect(screen.getByText('invalidCode')).toBeInTheDocument())
    expect(input('code').value).toBe('WRONG1')
    expect(confirmPasswordResetAction).toHaveBeenCalledWith({
      login: 'aigerim@example.com',
      code: 'WRONG1',
      newPassword: NEW_PASSWORD,
    })
    expect(push).not.toHaveBeenCalled()
  })

  it('checks the repeated password before calling the server', async () => {
    const user = userEvent.setup()
    render(<ResetPasswordClient email="aigerim@example.com" code="ABC123" />)
    await user.type(input('password'), NEW_PASSWORD)
    await user.type(input('confirmPassword'), 'Other-pass1!')
    await user.click(screen.getByRole('button', { name: 'submit' }))
    await waitFor(() => expect(screen.getByText('passwordsDoNotMatch')).toBeInTheDocument())
    expect(confirmPasswordResetAction).not.toHaveBeenCalled()
  })
})
