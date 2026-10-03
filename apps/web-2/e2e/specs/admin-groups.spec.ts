import { randomUUID } from 'node:crypto'

import { m } from '#/paraglide/messages'
import { createClient, createConfig } from '#/shared/api/gen/client'
import { addGroupMembers, createGroup, deleteGroup, listGroups } from '#/shared/api/gen/sdk.gen'
import type { Usergroup } from '#/shared/api/gen/types.gen'

import { expect, type Seed, test as base } from '../fixtures/seed'

const ru = { locale: 'ru' } as const
type Owner = 'teacher' | 'admin'
const cookie = (seed: Seed, role: Owner) => {
  const { name, value } = seed.accounts[role].cookie
  return { cookie: `${name}=${value}` }
}

// Groups made through the SDK (as the teacher unless told), deleted after each test.
const test = base.extend<{ api: ReturnType<typeof createClient>; group: (owner?: Owner) => Promise<Usergroup> }>({
  api: async ({ baseURL }, use) => use(createClient(createConfig({ baseUrl: String(baseURL) }))),
  group: async ({ api, seed }, use) => {
    const made: [string, Owner][] = []
    await use(async (owner = 'teacher') => {
      const name = `E2E группа ${randomUUID().slice(0, 8)}`
      const { data } = await createGroup({
        client: api,
        body: { name },
        headers: cookie(seed, owner),
        throwOnError: true,
      })
      made.push([data.id, owner])
      return data
    })
    for (const [id, owner] of made)
      await deleteGroup({ client: api, path: { group_id: id }, headers: cookie(seed, owner) })
  },
})

test('B-ADM-17 a teacher lists groups and makes one in the dialog', async ({ page, signInAs, api, seed, group }) => {
  const newest = await group()
  await signInAs('teacher')
  await page.goto('/teach/groups')
  const table = page.getByRole('table', { name: m.admin_groups_table({}, ru) })
  await expect(table.getByRole('link', { name: newest.name })).toBeVisible()
  await page.getByRole('button', { name: m.admin_group_new({}, ru) }).click()
  const dialog = page.getByRole('dialog', { name: m.admin_group_new({}, ru) })
  await dialog.getByRole('button', { name: m.admin_create_submit({}, ru) }).click()
  await expect(dialog.getByText(m.validation_required({}, ru))).toBeVisible()
  const name = `E2E новая группа ${randomUUID().slice(0, 8)}`
  await dialog.getByLabel(m.admin_field_name({}, ru)).fill(name)
  await dialog.getByRole('button', { name: m.admin_create_submit({}, ru) }).click()
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible()
  await expect(page.getByText(m.admin_group_created({}, ru))).toBeVisible()
  const id = new URL(page.url()).pathname.split('/').at(-1) ?? ''
  await deleteGroup({
    client: api,
    path: { group_id: id },
    headers: cookie(seed, 'teacher'),
    throwOnError: true,
  })
})

test('B-ADM-18 the group page edits its name; an unknown group is not found', async ({ page, signInAs, group }) => {
  const own = await group()
  await signInAs('teacher')
  await page.goto(`/teach/groups/${own.id}`)
  await expect(page.getByText(m.admin_group_members_empty({}, ru))).toBeVisible()
  const general = page.getByRole('form', { name: m.admin_section_general({}, ru) })
  const renamed = `${own.name} (изм.)`
  await general.getByLabel(m.admin_field_name({}, ru)).fill(renamed)
  await general.getByRole('button', { name: m.ui_save({}, ru) }).click()
  await expect(page.getByText(m.admin_saved({}, ru))).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { level: 1, name: renamed })).toBeVisible()
  for (const id of ['00000000-0000-4000-8000-000000000000', 'nope']) {
    await page.goto(`/teach/groups/${id}`)
    await expect(page.getByRole('heading', { name: m.admin_group_not_found({}, ru) })).toBeVisible()
  }
})

test('B-ADM-19 members are added by search and removed; without manage_members there are no controls', async ({
  page,
  signInAs,
  group,
  api,
  seed,
}) => {
  const own = await group()
  await signInAs('teacher')
  await page.goto(`/teach/groups/${own.id}`)
  const picker = page.getByRole('combobox', { name: m.admin_group_members_add({}, ru) })
  await picker.fill('e2e-student1')
  await page.getByRole('option', { name: /@e2e-student1\)/ }).click()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: m.admin_add({}, ru), exact: true }).click()
  await expect(page.getByText(m.admin_group_members_added({}, ru))).toBeVisible()
  const member = page.getByRole('listitem').filter({ hasText: '@e2e-student1' })
  await expect(member.getByRole('link', { name: 'E2E student1' })).toBeVisible()
  await member.getByRole('button', { name: m.admin_group_member_remove({ name: 'E2E student1' }, ru) }).click()
  await expect(page.getByText(m.admin_group_member_removed({}, ru))).toBeVisible()
  await expect(page.getByText(m.admin_group_members_empty({}, ru))).toBeVisible()

  // Someone else's group: the teacher reads it, the API lists no actions for them.
  const others = await group('admin')
  const student = seed.accounts.student.session.user_id
  await addGroupMembers({
    client: api,
    path: { group_id: others.id },
    body: { user_ids: [student] },
    headers: cookie(seed, 'admin'),
  })
  await page.goto(`/teach/groups/${others.id}`)
  await expect(page.getByRole('link', { name: 'E2E student1' })).toBeVisible()
  await expect(picker).toHaveCount(0)
  await expect(page.getByRole('button', { name: m.admin_delete({}, ru) })).toHaveCount(0)
})

test('B-ADM-20 deleting a group asks with its name, then returns to the list', async ({
  page,
  signInAs,
  group,
  api,
  seed,
}) => {
  const own = await group()
  await signInAs('teacher')
  await page.goto(`/teach/groups/${own.id}`)
  await page.getByRole('button', { name: m.admin_delete({}, ru) }).click()
  const confirm = page.getByRole('alertdialog', { name: m.admin_group_delete_title({ name: own.name }, ru) })
  await expect(confirm.getByRole('button', { name: m.ui_cancel({}, ru) })).toBeFocused()
  await confirm.getByRole('button', { name: m.admin_delete({}, ru) }).click()
  await expect(page.getByText(m.admin_group_deleted({}, ru))).toBeVisible()
  await expect(page).toHaveURL(/\/teach\/groups$/)
  const left = await listGroups({ client: api, query: { limit: 100 }, headers: cookie(seed, 'teacher') })
  expect(left.data?.items.some(item => item.id === own.id)).toBe(false)
})
