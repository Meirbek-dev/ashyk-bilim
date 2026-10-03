import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'

import type { Page } from '@playwright/test'

import { m } from '#/paraglide/messages'

import { accountWithTotp, newAccount, randomIp, registerAccount, totp, verificationCode } from '../fixtures/accounts'
import { e2ePassword, expect, test } from '../fixtures/seed'
import { gotoLive } from '../fixtures/test'

const ru = { locale: 'ru' } as const
// Not the fixture's e2e-student1: the API keeps at most 10 live sessions per user, and every worker already holds one
// of student1's. These sign-ins use student2 and end their session after each test.
const STUDENT = 'e2e-student2'

test.afterEach(async ({ page }) => {
  await page.request.post('/api/v2/auth/logout')
})

async function signIn(page: Page, login: string, password: string): Promise<void> {
  await page.getByLabel(m.auth_login_field_login({}, ru)).fill(login)
  // Exact: the reset's toast ("Пароль изменён...") is labelled too.
  await page.getByLabel(m.auth_login_field_password({}, ru), { exact: true }).fill(password)
  await page.getByRole('button', { name: m.auth_login_submit({}, ru) }).click()
}

test('B-AUTH-01 B-AUTH-09 a student signs in, lands on /home and signs out', { tag: '@smoke' }, async ({ page }) => {
  await page.goto('/login')
  await signIn(page, STUDENT, e2ePassword())
  await expect(page).toHaveURL(/\/home$/)
  await expect(page.getByRole('heading', { name: m.home_title({}, ru) })).toBeVisible()

  await page.getByRole('button', { name: m.platform_profile_menu({}, ru) }).click()
  await page.getByRole('menuitem', { name: m.auth_logout({}, ru) }).click()
  await expect(page).toHaveURL(/\/$/)
  await page.goto('/home')
  await expect(page).toHaveURL(/\/login\?redirect=/)
})

test('B-AUTH-01 sign-in returns to the internal path in redirect', async ({ page }) => {
  await page.goto(`/login?redirect=${encodeURIComponent('/collections?q=seed')}`)
  await signIn(page, STUDENT, e2ePassword())
  await expect(page).toHaveURL(/\/collections\?q=seed$/)
})

test('B-AUTH-02 an outside redirect lands on /home', async ({ page }) => {
  await page.goto(`/login?redirect=${encodeURIComponent('https://evil.example/')}`)
  await signIn(page, STUDENT, e2ePassword())
  await expect(page).toHaveURL(/\/home$/)
})

test('B-AUTH-03 a wrong password is reported in place and the login stays', async ({ page }) => {
  await page.goto('/login')
  await signIn(page, STUDENT, 'not-the-password')
  await expect(page.getByRole('alert')).toHaveText(m.auth_login_error_credentials({}, ru))
  await expect(page.getByLabel(m.auth_login_field_login({}, ru))).toHaveValue(STUDENT)
})

test('B-AUTH-04 an account with 2FA signs in with the code step', async ({ page, baseURL }) => {
  const account = await accountWithTotp(String(baseURL))
  await page.goto('/login')
  await signIn(page, account.username, account.password)
  const code = page.getByLabel(m.auth_login_field_totp({}, ru))
  await expect(code).toBeVisible()
  await expect(page.getByRole('link', { name: m.auth_login_google({}, ru) })).toHaveCount(0)

  await code.fill('000000')
  await page.getByRole('button', { name: m.auth_login_submit({}, ru) }).click()
  await expect(page.getByRole('alert')).toHaveText(m.auth_login_error_totp({}, ru))

  await page.getByRole('button', { name: m.auth_login_back({}, ru) }).click()
  await expect(page.getByLabel(m.auth_login_field_login({}, ru))).toHaveValue(account.username)
  await page.getByRole('button', { name: m.auth_login_submit({}, ru) }).click()
  await page.getByLabel(m.auth_login_field_totp({}, ru)).fill(totp(account.secret))
  await page.getByRole('button', { name: m.auth_login_submit({}, ru) }).click()
  await expect(page).toHaveURL(/\/home$/)
})

test('B-AUTH-05 the Google button links to the API with the checked return path', async ({ page }) => {
  await page.goto(`/login?redirect=${encodeURIComponent('/collections')}`)
  await expect(page.getByRole('link', { name: m.auth_login_google({}, ru) })).toHaveAttribute(
    'href',
    '/api/v2/auth/google?callback=%2Fcollections',
  )
  await page.goto('/login?error=google-cancelled')
  await expect(page.getByRole('alert')).toHaveText(m.auth_login_error_google_cancelled({}, ru))
  await page.goto('/login?error=google-oauth-expired')
  await expect(page.getByRole('alert')).toHaveText(m.errors_google_oauth_expired({}, ru))
})

test('B-AUTH-06 B-AUTH-07 a guest signs up and lands on the email check', async ({ page }) => {
  const account = newAccount()
  await page.setExtraHTTPHeaders({ 'x-real-ip': randomIp() })
  await page.goto('/signup')
  const field = (label: string) => page.getByLabel(label, { exact: true })
  await page.getByRole('button', { name: m.auth_signup_submit({}, ru) }).click()
  await expect(field(m.auth_signup_field_first_name({}, ru))).toHaveAttribute('aria-invalid', 'true')

  await field(m.auth_signup_field_first_name({}, ru)).fill('Айгерім')
  await field(m.auth_signup_field_last_name({}, ru)).fill('Сейітқызы')
  await field(m.auth_signup_field_organization({}, ru)).fill('E2E')
  await field(m.auth_signup_field_username({}, ru)).fill(STUDENT)
  await field(m.auth_signup_field_email({}, ru)).fill(account.email)
  await field(m.auth_signup_field_password({}, ru)).fill(account.password)
  const submit = page.getByRole('button', { name: m.auth_signup_submit({}, ru) })
  const register = page.waitForRequest(request => request.url().endsWith('/api/v2/auth/register'))
  await submit.click()
  const sent = (await register).headers()
  expect(sent['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/)
  expect(sent['accept-language']).toBe('ru')
  await expect(page.getByText(m.errors_username_taken({}, ru))).toBeVisible()
  await expect(field(m.auth_signup_field_email({}, ru))).toHaveValue(account.email)

  await field(m.auth_signup_field_username({}, ru)).fill(account.username)
  await submit.click()
  await expect(page).toHaveURL(new RegExp(`/verify-email\\?email=${encodeURIComponent(account.email)}`))
  await expect(page.getByText(m.auth_signup_done({}, ru))).toBeVisible()
  await expect(page.getByLabel(m.auth_signup_field_email({}, ru))).toHaveValue(account.email)
})

test('B-AUTH-08 the emailed code confirms the address; a wrong one keeps the input', async ({ page, baseURL }) => {
  const account = await registerAccount(String(baseURL), newAccount()) // unverified: never a pool one
  const code = await verificationCode(account.email)
  await page.setExtraHTTPHeaders({ 'x-real-ip': randomIp() })
  await page.goto(`/verify-email?email=${encodeURIComponent(account.email)}`)
  const codeField = page.getByLabel(m.auth_verify_field_code({}, ru))
  await codeField.fill('WRONG1')
  await page.getByRole('button', { name: m.auth_verify_submit({}, ru) }).click()
  await expect(page.getByText(m.auth_verify_error_code({}, ru))).toBeVisible()
  await expect(page.getByLabel(m.auth_signup_field_email({}, ru))).toHaveValue(account.email)

  // Typed in lower case: the same code (UX-205).
  await codeField.fill(code.toLowerCase())
  await page.getByRole('button', { name: m.auth_verify_submit({}, ru) }).click()
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByText(m.auth_verify_done({}, ru))).toBeVisible()
})

/** The emailed reset code: without a mailer the API logs it like the verification code (accounts.ts). The latest. */
async function resetCode(email: string): Promise<string> {
  const path = process.env['E2E_API_LOG']
  if (!path) throw new Error('Set E2E_API_LOG to the API log file: without a mailer the API logs reset codes')
  const address = email.replaceAll(/[.@+-]/g, '\\$&')
  const pattern = new RegExp(`password reset code not delivered.*?${address}\\W+code\\W+([A-Za-z0-9]{4,})`, 'g')
  let code = ''
  await expect
    .poll(() => (code = [...readFileSync(path, 'utf8').matchAll(pattern)].at(-1)?.[1] ?? ''), { timeout: 15_000 })
    .not.toBe('')
  return code
}

test('B-AUTH-12 B-AUTH-13 a forgotten password is reset with the emailed code; the new one signs in', async ({
  page,
  baseURL,
}) => {
  const account = await registerAccount(String(baseURL))
  const password = `E2e-${randomUUID().slice(0, 8)}-New1!`
  await page.setExtraHTTPHeaders({ 'x-real-ip': randomIp() })
  await page.goto('/login')
  await page.getByRole('link', { name: m.auth_login_forgot({}, ru) }).click()
  await expect(page).toHaveURL(/\/reset-password$/)
  await page.getByLabel(m.auth_login_field_login({}, ru)).fill(account.username)
  const request = page.waitForRequest(sent => sent.url().endsWith('/api/v2/auth/password-reset'))
  await page.getByRole('button', { name: m.auth_reset_request_submit({}, ru) }).click()
  expect((await request).headers()['accept-language']).toBe('ru')
  await expect(page.getByText(m.auth_reset_sent({}, ru))).toBeVisible()
  await expect(page).toHaveURL(/\/reset-password$/)
  const code = await resetCode(account.email)

  const codeField = page.getByLabel(m.auth_reset_field_code({}, ru))
  const passwordField = page.getByLabel(m.auth_reset_field_password({}, ru))
  await codeField.fill('WRONG1')
  await passwordField.fill(password)
  const submit = page.getByRole('button', { name: m.auth_reset_submit({}, ru) })
  await submit.click()
  await expect(page.getByText(m.errors_reset_code_invalid({}, ru))).toBeVisible()
  await expect(codeField).toHaveValue('WRONG1')

  await codeField.fill(code)
  await submit.click()
  await expect(page).toHaveURL(/\/login$/)
  const done = page.getByText(m.auth_reset_done({}, ru))
  await expect(done).toBeVisible()
  // A toast still leaving while the next page renders trips axe (aria-hidden-focus): let it go first.
  await expect(done).toBeHidden({ timeout: 15_000 })
  await signIn(page, account.username, password)
  await expect(page).toHaveURL(/\/home$/)
})

test('B-AUTH-12 B-AUTH-13 an unknown login gets the same answer; the email link opens the code step', async ({
  page,
}) => {
  await page.setExtraHTTPHeaders({ 'x-real-ip': randomIp() })
  await page.goto('/reset-password')
  await page.getByLabel(m.auth_login_field_login({}, ru)).fill(`nobody-${randomUUID().slice(0, 8)}`)
  await page.getByRole('button', { name: m.auth_reset_request_submit({}, ru) }).click()
  await expect(page.getByText(m.auth_reset_sent({}, ru))).toBeVisible()
  await page.getByRole('button', { name: m.auth_reset_again({}, ru) }).click()
  await expect(page.getByLabel(m.auth_login_field_login({}, ru))).toBeVisible()

  await page.goto('/reset-password?email=a%40e2e.test&code=ABC123')
  await expect(page.getByLabel(m.auth_reset_field_code({}, ru))).toHaveValue('ABC123')
  await expect(page.getByLabel(m.auth_reset_field_password({}, ru))).toBeVisible()
})

test('B-AUTH-14 the verification code is sent again; a throttled resend names the wait', async ({ page, baseURL }) => {
  const account = await registerAccount(String(baseURL), newAccount()) // unverified: never a pool one
  await page.setExtraHTTPHeaders({ 'x-real-ip': randomIp() })
  await page.goto(`/verify-email?email=${encodeURIComponent(account.email)}`)
  const resend = page.getByRole('button', { name: m.auth_verify_resend({}, ru) })
  const sent = page.waitForRequest(request => request.url().endsWith('/api/v2/auth/verify-email/resend'))
  await resend.click()
  expect((await sent).postDataJSON()).toEqual({ email: account.email })
  await expect(page.getByText(m.auth_verify_resent({}, ru))).toBeVisible()

  // The local API runs with the per-address limit lifted (api-env), so the 429 comes from the route.
  const problem = { type: 'about:blank', status: 429, code: 'rate-limited', title: 'Too many requests' }
  await page.route('**/api/v2/auth/verify-email/resend', route =>
    route.fulfill({
      status: 429,
      contentType: 'application/problem+json',
      headers: { 'retry-after': '125' },
      body: JSON.stringify(problem),
    }),
  )
  await resend.click()
  await expect(page.getByRole('alert')).toHaveText(m.auth_login_error_retry_in({ minutes: 3 }, ru))
})

test('B-AUTH-10 a guest on a closed page signs in and returns; guest pages send a signed-in user home', async ({
  page,
}) => {
  await page.goto('/learning')
  await expect(page).toHaveURL(/\/login\?redirect=%2Flearning$/)
  await signIn(page, STUDENT, e2ePassword())
  await expect(page).toHaveURL(/\/learning$/)
  for (const path of ['/login', '/signup', '/verify-email', '/reset-password']) {
    // The last one is settled (hydrated, stream open) before the fixture resizes the page: a view transition still
    // running would reject (Chromium).
    await gotoLive(page, path)
    await expect(page).toHaveURL(/\/home$/)
  }
})

for (const locale of ['kk', 'en'] as const) {
  test(`B-AUTH-11 the guest pages speak ${locale}`, async ({ page, context, baseURL }) => {
    await context.addCookies([{ name: 'ab_locale', value: locale, url: String(baseURL) }])
    const titles = [
      ['/login', m.auth_login_title({}, { locale })],
      ['/signup', m.auth_signup_title({}, { locale })],
      ['/verify-email', m.auth_verify_title({}, { locale })],
      ['/reset-password', m.platform_page_reset_password({}, { locale })],
    ] as const
    for (const [path, title] of titles) {
      await page.goto(path)
      await expect(page.locator('html')).toHaveAttribute('lang', locale)
      await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible()
      await expect(page.locator('body')).not.toContainText(/\b(auth|platform|ui|errors)_[a-z_]+/)
    }
  })
}
