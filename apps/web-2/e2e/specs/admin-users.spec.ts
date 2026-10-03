import { randomUUID } from 'node:crypto'

import type { Page } from '@playwright/test'

import { m } from '#/paraglide/messages'
import { createClient, createConfig } from '#/shared/api/gen/client'
import { createUsergroup, deleteUsergroup, listUsergroupMembers, listUsers } from '#/shared/api/gen/sdk.gen'

import { type NewAccount, registerAccount } from '../fixtures/accounts'
import { expect, type Seed, test as base } from '../fixtures/seed'

const ru = { locale: 'ru' } as const
const cookie = (seed: Seed) => {
  const { name, value } = seed.accounts.admin.cookie
  return { cookie: `${name}=${value}` }
}

// Each test acts as the admin on a fresh self-registered account (never on the shared seed accounts).
const test = base.extend<{ api: ReturnType<typeof createClient>; account: NewAccount }>({
  api: async ({ baseURL }, use) => use(createClient(createConfig({ baseUrl: String(baseURL) }))),
  account: async ({ baseURL, signInAs }, use) => {
    const account = await registerAccount(String(baseURL))
    await signInAs('admin')
    await use(account)
  },
})

const panel = (page: Page, name: string) => page.getByRole('dialog', { name })
// The list is searched for the same user, so the table behind the panel shows their row.
const openPanel = (page: Page, username: string) =>
  page.goto(`/admin/users?q=${username}&user=${username}`).then(() => panel(page, 'E2E Account'))

test('B-ADM-01 one directory with "Show more", cards at 390 px', async ({ page, signInAs }) => {
  await signInAs('admin')
  await page.goto('/admin/users')
  await expect(page.getByRole('heading', { level: 1, name: m.admin_users_title({}, ru) })).toBeVisible()
  const table = page.getByRole('table', { name: m.admin_users_table({}, ru) })
  await expect(table.getByRole('row')).toHaveCount(21)
  await page.getByRole('button', { name: m.ui_show_more({}, ru) }).click()
  await expect.poll(() => table.getByRole('row').count()).toBeGreaterThan(21)
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(table).toBeHidden()
  await expect(page.getByRole('listitem').getByText('@e2e-').first()).toBeVisible()
})

test('B-ADM-02 the search lives in the URL', async ({ page, account }) => {
  const box = page.getByLabel(m.admin_users_search({}, ru))
  await page.goto('/admin/users')
  await box.fill(account.username)
  await box.press('Enter')
  await expect(page).toHaveURL(new RegExp(`\\?q=${account.username}$`))
  await expect(page.getByRole('table').getByText(account.email)).toBeVisible()
  await page.reload()
  await expect(box).toHaveValue(account.username)
  await box.fill(`nobody-${randomUUID()}`)
  await box.press('Enter')
  await expect(page.getByText(m.ui_no_matches({}, ru))).toBeVisible()
  await page.getByRole('button', { name: m.ui_reset_filters({}, ru) }).click()
  await expect(page).toHaveURL(/\/admin\/users$/)
})

test('B-ADM-03 the panel is a shareable address that survives a reload', async ({ page, account }) => {
  await page.goto(`/admin/users?q=${account.username}`)
  await page.getByRole('table').getByRole('link', { name: 'E2E Account' }).click()
  await expect(page).toHaveURL(new RegExp(`user=${account.username}`))
  const sheet = panel(page, 'E2E Account')
  await expect(sheet.getByText(account.email)).toBeVisible()
  await page.reload()
  await expect(sheet.getByText(`@${account.username}`)).toBeVisible()
  await sheet.getByRole('button', { name: m.ui_close({}, ru) }).click()
  await expect(page).not.toHaveURL(/user=/)
  await page.goto(`/admin/users?user=nobody-${randomUUID().slice(0, 8)}`)
  await expect(panel(page, m.admin_user_not_found({}, ru))).toBeVisible()
})

test('B-ADM-04 roles are added and removed in the panel; the table follows', async ({ page, account }) => {
  const sheet = await openPanel(page, account.username)
  const teacher = m.admin_role_instructor({}, ru)
  await sheet.getByLabel(m.admin_user_role_add({}, ru)).selectOption({ label: teacher })
  await sheet.getByRole('button', { name: m.admin_add({}, ru), exact: true }).click()
  await expect(page.getByText(m.admin_user_role_added({}, ru))).toBeVisible()
  // The panel is modal: the table behind it is out of the accessibility tree, so it is found by element.
  await expect(page.locator('table').getByText(teacher)).toBeVisible()
  await sheet.getByRole('button', { name: m.admin_user_role_remove({ role: teacher }, ru) }).click()
  await expect(page.getByText(m.admin_user_role_removed({}, ru))).toBeVisible()
  await expect(sheet.getByRole('listitem').filter({ hasText: teacher })).toHaveCount(0)
})

test('B-ADM-05 disable asks first, enable does not', async ({ page, account, api, seed }) => {
  const sheet = await openPanel(page, account.username)
  await sheet.getByRole('button', { name: m.admin_user_disable({}, ru) }).click()
  const confirm = page.getByRole('alertdialog', { name: m.admin_user_disable_title({ name: 'E2E Account' }, ru) })
  await expect(confirm.getByRole('button', { name: m.ui_cancel({}, ru) })).toBeFocused()
  await confirm.getByRole('button', { name: m.admin_user_disable({}, ru) }).click()
  await expect(page.getByText(m.admin_user_disabled({}, ru))).toBeVisible()
  await expect(sheet.getByText(m.admin_status_disabled({}, ru))).toBeVisible()
  const users = await listUsers({ client: api, query: { q: account.username }, headers: cookie(seed) })
  expect(users.data?.items[0]?.status).toBe('disabled')
  await sheet.getByRole('button', { name: m.admin_user_enable({}, ru) }).click()
  await expect(page.getByText(m.admin_user_enabled({}, ru))).toBeVisible()
  await expect(sheet.getByRole('button', { name: m.admin_user_disable({}, ru) })).toBeVisible()
})

test('B-ADM-06 "Add to group" puts the user among the members', async ({ page, account, api, seed }) => {
  const name = `E2E group ${randomUUID().slice(0, 8)}`
  const group = await createUsergroup({ client: api, body: { name }, headers: cookie(seed), throwOnError: true })
  try {
    const sheet = await openPanel(page, account.username)
    await sheet.getByLabel(m.admin_user_group_field({}, ru)).selectOption({ label: name })
    await sheet.getByRole('button', { name: m.admin_user_group_add({}, ru) }).click()
    await expect(page.getByText(m.admin_user_group_added({}, ru))).toBeVisible()
    const members = await listUsergroupMembers({
      client: api,
      path: { usergroup_id: group.data.id },
      headers: cookie(seed),
    })
    expect(members.data?.map(member => member.username)).toEqual([account.username])
  } finally {
    await deleteUsergroup({ client: api, path: { usergroup_id: group.data.id }, headers: cookie(seed) })
  }
})

test('B-ADM-07 a new user is made in the dialog; a taken username lands under its field', async ({
  page,
  signInAs,
}) => {
  await signInAs('admin')
  await page.goto('/admin/users')
  await page.getByRole('button', { name: m.admin_user_new({}, ru) }).click()
  const dialog = page.getByRole('dialog', { name: m.admin_user_new({}, ru) })
  const create = dialog.getByRole('button', { name: m.admin_create_submit({}, ru) })
  await create.click()
  // The contract declares no field constraints yet (S-01): the server's 422 marks the fields.
  const firstName = dialog.getByLabel(m.admin_user_field_first_name({}, ru), { exact: true })
  await expect(firstName).toHaveAttribute('aria-invalid', 'true')
  const username = `e2e-new-${randomUUID().slice(0, 8)}`
  await firstName.fill('Новый')
  await dialog.getByLabel(m.admin_user_field_last_name({}, ru)).fill('Пользователь')
  await dialog.getByLabel(m.admin_user_username({}, ru)).fill('e2e-teacher')
  await dialog.getByLabel(m.admin_user_field_email({}, ru)).fill(`${username}@e2e.test`)
  await create.click()
  await expect(dialog.getByText(m.errors_username_taken({}, ru))).toBeVisible()
  await dialog.getByLabel(m.admin_user_username({}, ru)).fill(username)
  await create.click()
  await expect(page.getByText(m.admin_user_created({}, ru))).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`user=${username}`))
  await expect(panel(page, 'Новый Пользователь').getByText(`${username}@e2e.test`)).toBeVisible()
})

test('B-ADM-16 "Award XP" sends its idempotency key in the body', async ({ page, account }) => {
  const sheet = await openPanel(page, account.username)
  const award = sheet.getByRole('button', { name: m.admin_award_submit({}, ru) })
  await award.click()
  await expect(sheet.getByText(m.validation_format({}, ru))).toBeVisible()
  await sheet.getByLabel(m.admin_award_amount({}, ru)).fill('15')
  await sheet.getByLabel(m.admin_award_reason({}, ru)).fill('e2e')
  const request = page.waitForRequest(sent => sent.method() === 'POST' && sent.url().endsWith('/gamification/xp'))
  await award.click()
  const body: unknown = (await request).postDataJSON()
  expect(body).toMatchObject({ amount: 15, reason: 'e2e', idempotency_key: expect.stringMatching(/^[0-9a-f-]{36}$/) })
  await expect(page.getByText(m.admin_award_done({ total: 15 }, ru))).toBeVisible()
})
