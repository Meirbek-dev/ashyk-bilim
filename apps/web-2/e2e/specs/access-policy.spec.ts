import { m } from '#/paraglide/messages'

import { expect, test } from '../fixtures/seed'
import { expectFailure, inspectPage } from '../fixtures/test'

const ru = { locale: 'ru' } as const

// Independent product expectations: these cases deliberately do not read the app's access table.
for (const role of ['student', 'teacher', 'admin'] as const) {
  for (const [path, title, allowed] of [
    ['/admin/users', m.admin_users_title({}, ru), role === 'admin'],
    ['/teach/courses', m.studio_courses_title({}, ru), role !== 'student'],
    ['/home', m.home_title({}, ru), true],
  ] as const) {
    test(`${role} has the specified access to ${path}`, async ({ page, signInAs }) => {
      await signInAs(role)
      if (!allowed) expectFailure(page, new RegExp(`^${path}$`), 403)
      const response = await page.goto(path)
      expect(response?.status()).toBe(allowed ? 200 : 403)
      await expect(
        page.getByRole('heading', { level: 1, name: allowed ? title : m.platform_forbidden_title({}, ru) }),
      ).toBeVisible()
    })
  }
}

test('a signed-in account can become a guest and loses protected access', async ({ page, signInAs }) => {
  await signInAs('student')
  await page.goto('/home')
  await expect(page.getByRole('heading', { level: 1, name: m.home_title({}, ru) })).toBeVisible()
  await page.getByRole('button', { name: m.platform_profile_menu({}, ru) }).click()
  await inspectPage(page)
  await signInAs('guest')
  await page.goto('/home')
  await expect(page).toHaveURL(/\/login\?redirect=/)
})
