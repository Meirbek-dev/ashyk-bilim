/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from 'vite-plus/test'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SignupClient from '@/app/[locale]/auth/signup/signup'

const catalog: Record<string, string> = {
  'codes.username-taken': 'Username taken',
  'codes.email-taken': 'Email taken',
  'codes.rate-limited': 'Slow down',
  'fields.invalid': 'Invalid value',
}
vi.mock('next-intl', () => ({
  useLocale: () => 'ru-RU',
  useTranslations: (ns?: string) =>
    Object.assign((key: string) => (ns === 'Errors' ? (catalog[key] ?? key) : key), {
      has: (key: string) => key in catalog,
    }),
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

const registerAction = vi.fn()
vi.mock('@/app/actions/auth', () => ({ registerAction: (...args: unknown[]) => registerAction(...args) }))

const input = (name: string) => document.querySelector<HTMLInputElement>(`input[name="${name}"]`)!

async function fillValid(user: ReturnType<typeof userEvent.setup>) {
  await user.type(input('firstName'), 'Aigerim')
  await user.type(input('lastName'), 'Test')
  await user.type(input('username'), 'aigerim.k')
  await user.type(input('email'), 'aigerim@example.com')
  await user.type(input('password'), 'correct horse')
  await user.type(input('confirmPassword'), 'correct horse')
}

beforeEach(() => vi.clearAllMocks())

describe('/auth/signup', () => {
  it('validates locally before calling the server (short password, mismatch, bad username)', async () => {
    const user = userEvent.setup()
    render(<SignupClient />)
    await user.type(input('username'), 'no spaces!')
    await user.type(input('password'), 'short')
    await user.type(input('confirmPassword'), 'other')
    await user.click(screen.getByRole('button', { name: 'submit' }))

    // Two `usernameRule` texts: the hint and the error. (The form re-mounts
    // after the action, so every assertion waits for the settled render.)
    await waitFor(() => expect(screen.getAllByText('usernameRule')).toHaveLength(2))
    await waitFor(() => expect(screen.getByText('passwordTooShort')).toBeInTheDocument())
    await waitFor(() => expect(screen.getByText('passwordsDoNotMatch')).toBeInTheDocument())
    await waitFor(() => expect(screen.getAllByText('required').length).toBeGreaterThan(0))
    expect(registerAction).not.toHaveBeenCalled()
  })

  it('posts the wire shape and lands on login with a toast', async () => {
    registerAction.mockResolvedValue({ ok: true })
    const user = userEvent.setup()
    render(<SignupClient />)
    await fillValid(user)
    await user.click(screen.getByRole('button', { name: 'submit' }))

    await waitFor(() =>
      expect(registerAction).toHaveBeenCalledWith({
        firstName: 'Aigerim',
        lastName: 'Test',
        username: 'aigerim.k',
        email: 'aigerim@example.com',
        password: 'correct horse',
        confirmPassword: 'correct horse',
        // UX-101: the signer's UI locale prefixes the verification link.
        locale: 'ru-RU',
      }),
    )
    await waitFor(() => expect(push).toHaveBeenCalledWith('/auth/login'))
  })

  it('maps username-taken / email-taken onto their fields and keeps the values', async () => {
    registerAction.mockResolvedValueOnce({ ok: false, code: 'email-taken' })
    const user = userEvent.setup()
    render(<SignupClient />)
    await fillValid(user)
    await user.click(screen.getByRole('button', { name: 'submit' }))

    expect(await screen.findByText('Email taken')).toBeInTheDocument()
    expect(screen.queryByText('failed')).toBeNull()
    expect(input('username')).toHaveValue('aigerim.k')
    expect(push).not.toHaveBeenCalled()
  })

  it('shows other contract codes as a banner', async () => {
    registerAction.mockResolvedValueOnce({ ok: false, code: 'rate-limited' })
    const user = userEvent.setup()
    render(<SignupClient />)
    await fillValid(user)
    await user.click(screen.getByRole('button', { name: 'submit' }))
    expect(await screen.findByText('Slow down')).toBeInTheDocument()
  })
})
