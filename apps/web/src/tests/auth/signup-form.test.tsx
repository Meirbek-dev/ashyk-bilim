/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from 'vite-plus/test'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SignupClient from '@/app/[locale]/auth/signup/signup'
import enMessages from '@/messages/en-US.json'
import kkMessages from '@/messages/kk-KZ.json'
import ruMessages from '@/messages/ru-RU.json'

const catalog: Record<string, string> = {
  'codes.username-taken': 'Username taken',
  'codes.email-taken': 'Email taken',
  'codes.rate-limited': 'Slow down',
  'fields.invalid': 'Invalid value',
  'fields.password-too-long': ruMessages.Errors.fields['password-too-long'],
  'fields.password-policy': ruMessages.Errors.fields['password-policy'],
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
vi.mock('@components/auth/card', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

const registerAction = vi.fn()
vi.mock('@/app/actions/auth', () => ({ registerAction: (...args: unknown[]) => registerAction(...args) }))

const input = (name: string) => document.querySelector<HTMLInputElement>(`input[name="${name}"]`)!

async function fillValid(user: ReturnType<typeof userEvent.setup>) {
  await user.type(input('firstName'), 'Aigerim')
  await user.type(input('lastName'), 'Test')
  await user.type(input('username'), 'aigerim.k')
  await user.type(input('email'), 'aigerim@example.com')
  await user.type(input('password'), 'Correct horse 1')
  await user.type(input('confirmPassword'), 'Correct horse 1')
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
        password: 'Correct horse 1',
        confirmPassword: 'Correct horse 1',
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

  it('UX-201: a Cyrillic-only case pair is flagged before submit with the Latin rule, in every locale', async () => {
    for (const [messages, latin] of [
      [ruMessages, /латинск/],
      [kkMessages, /латын/],
      [enMessages, /Latin/],
    ] as const) {
      expect(messages.Errors.fields['password-policy']).toMatch(latin)
      expect(messages.Auth.Signup.passwordRule).toMatch(latin)
    }
    const user = userEvent.setup()
    render(<SignupClient />)
    await fillValid(user)
    await user.clear(input('password'))
    await user.type(input('password'), 'Пароль1!зима')
    await user.clear(input('confirmPassword'))
    await user.type(input('confirmPassword'), 'Пароль1!зима')
    await user.click(screen.getByRole('button', { name: 'submit' }))
    expect(await screen.findByText(ruMessages.Errors.fields['password-policy'])).toBeInTheDocument()
    expect(registerAction).not.toHaveBeenCalled()
  })

  it('BUG-293: a server password-too-long lands on the password field, worded in every locale', async () => {
    for (const messages of [ruMessages, kkMessages, enMessages]) {
      expect(messages.Errors.fields['password-too-long']).toMatch(/72/)
      expect(messages.Auth.Signup.passwordRule).toMatch(/72/)
    }
    registerAction.mockResolvedValueOnce({
      ok: false,
      code: 'validation-failed',
      fieldErrors: { password: 'password-too-long' },
    })
    const user = userEvent.setup()
    render(<SignupClient />)
    await fillValid(user)
    await user.click(screen.getByRole('button', { name: 'submit' }))
    expect(await screen.findByText(ruMessages.Errors.fields['password-too-long'])).toBeInTheDocument()
  })
})
