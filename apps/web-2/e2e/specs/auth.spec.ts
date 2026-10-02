import { m } from '#/paraglide/messages'

import { expect, test } from '../fixtures/test'

// `ashyq admin seed-e2e` (S-03) creates e2e-student1 with the password from E2E_PASSWORD.
function seededStudent(): { login: string; password: string } {
  const password = process.env['E2E_PASSWORD']
  if (!password) throw new Error('Set E2E_PASSWORD to the password `ashyq admin seed-e2e` used')
  return { login: process.env['E2E_STUDENT_LOGIN'] ?? 'e2e-student1', password }
}

const ru = { locale: 'ru' } as const

test(
  'a student signs in with a password, sees the session on /home and signs out',
  { tag: '@smoke' },
  async ({ page }) => {
    const student = seededStudent()
    await page.goto('/login?redirect=/home')
    await page.getByLabel(m.auth_login_field_login({}, ru)).fill(student.login)
    await page.getByLabel(m.auth_login_field_password({}, ru)).fill(student.password)
    await page.getByRole('button', { name: m.auth_login_submit({}, ru) }).click()

    await expect(page).toHaveURL(/\/home$/)
    await expect(page.getByRole('heading', { name: m.home_title({}, ru) })).toBeVisible()

    await page.getByRole('button', { name: m.auth_logout({}, ru) }).click()
    await expect(page).toHaveURL(/\/$/)
    await page.goto('/home')
    await expect(page).toHaveURL(/\/login\?redirect=/)
  },
)

test('a wrong password is reported in place', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel(m.auth_login_field_login({}, ru)).fill(seededStudent().login)
  await page.getByLabel(m.auth_login_field_password({}, ru)).fill('not-the-password')
  await page.getByRole('button', { name: m.auth_login_submit({}, ru) }).click()
  await expect(page.getByRole('alert')).toHaveText(m.auth_login_error_credentials({}, ru))
})
