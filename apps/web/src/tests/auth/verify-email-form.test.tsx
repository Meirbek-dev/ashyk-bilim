/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from 'vite-plus/test'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import VerifyEmailClient from '@/app/[locale]/auth/verify-email/verify-email'

vi.mock('next-intl', () => ({
  useTranslations: () => Object.assign((key: string) => key, { has: () => false }),
}))
const push = vi.fn()
vi.mock('@/i18n/navigation', () => ({ useRouter: () => ({ push }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }))
vi.mock('@services/config/config', () => ({ getAbsoluteUrl: (p: string) => p }))
vi.mock('@components/ui/AppLink', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}))
vi.mock('@components/auth/logo', () => ({ default: () => null }))
vi.mock('@components/auth/card', () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }))

const verifyEmailAction = vi.fn()
vi.mock('@/app/actions/auth', () => ({ verifyEmailAction: (...args: unknown[]) => verifyEmailAction(...args) }))

const input = (name: string) => document.querySelector<HTMLInputElement>(`input[name="${name}"]`)!

beforeEach(() => vi.clearAllMocks())

describe('/auth/verify-email', () => {
  // UX-016: the form action reset the uncontrolled inputs after a wrong
  // code, wiping the email; the retry then failed on «required» for email.
  it('keeps the email and code after a wrong-code 422', async () => {
    verifyEmailAction.mockResolvedValue({ ok: false, code: 'validation-failed', fieldErrors: { code: 'invalid' } })
    const user = userEvent.setup()
    render(<VerifyEmailClient email="aigerim@example.com" code="" />)
    await user.type(input('code'), 'WRONG1')
    await user.click(screen.getByRole('button', { name: 'submit' }))

    await waitFor(() => expect(screen.getByText('invalidCode')).toBeInTheDocument())
    expect(input('email').value).toBe('aigerim@example.com')
    expect(input('code').value).toBe('WRONG1')
    expect(verifyEmailAction).toHaveBeenCalledWith({ email: 'aigerim@example.com', code: 'WRONG1' })
  })
})
