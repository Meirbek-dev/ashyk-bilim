import { m } from '#/paraglide/messages'

import { expect, test } from '../fixtures/seed'

const ru = { locale: 'ru' } as const

test("B-SET-19 one's own public profile offers 'Edit profile'; someone else's does not", async ({
  page,
  signInAs,
  seed,
}) => {
  await signInAs('student')
  await page.goto(`/users/${seed.accounts.student.session.user.username}`)
  await page.getByRole('link', { name: m.settings_user_edit({}, ru) }).click()
  await expect(page).toHaveURL(/\/settings\/profile$/)
  await page.goto(`/users/${seed.params.username}`)
  await expect(page.getByRole('heading', { level: 1, name: 'E2E teacher' })).toBeVisible()
  await expect(page.getByRole('link', { name: m.settings_user_edit({}, ru) })).toHaveCount(0)
})

test('B-SET-14 a profile address in another case moves to its one address (canonical, links shared)', async ({
  page,
  seed,
}) => {
  const response = await page.request.get(`/users/${seed.params.username.toUpperCase()}`, { maxRedirects: 0 })
  expect(response.status()).toBe(301)
  expect(response.headers()['location']).toMatch(new RegExp(`/users/${seed.params.username}$`))
  await page.goto(`/users/${seed.params.username.toUpperCase()}`)
  await expect(page).toHaveURL(new RegExp(`/users/${seed.params.username}$`))
  await expect(page.getByRole('heading', { level: 1, name: 'E2E teacher' })).toBeVisible()
})
