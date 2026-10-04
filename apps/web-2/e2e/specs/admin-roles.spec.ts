import { randomUUID } from 'node:crypto'

import { m } from '#/paraglide/messages'
import { createClient, createConfig } from '#/shared/api/gen/client'
import { createRole, deleteRole, getRole, listRoles, updateRole } from '#/shared/api/gen/sdk.gen'

import { expect, type Seed, test as base } from '../fixtures/seed'

const ru = { locale: 'ru' } as const
const cookie = (seed: Seed) => {
  const { name, value } = seed.accounts.admin.cookie
  return { cookie: `${name}=${value}` }
}

// Custom roles made through the SDK as the admin, deleted after each test (a 404 for ones the test deleted).
const test = base.extend<{ api: ReturnType<typeof createClient>; role: () => Promise<{ slug: string; name: string }> }>(
  {
    api: async ({ baseURL }, use) => use(createClient(createConfig({ baseUrl: String(baseURL) }))),
    role: async ({ api, seed, signInAs }, use) => {
      await signInAs('admin')
      const made: string[] = []
      await use(async () => {
        const slug = `e2e-${randomUUID().slice(0, 8)}`
        const name = `E2E роль ${slug}`
        await createRole({
          client: api,
          body: { slug, display_name: name, priority: 5 },
          headers: cookie(seed),
          throwOnError: true,
        })
        made.push(slug)
        return { slug, name }
      })
      for (const slug of made) await deleteRole({ client: api, path: { slug }, headers: cookie(seed) })
    },
  },
)

test('B-ADM-08 system roles are named from the catalog', async ({ page, signInAs }) => {
  await signInAs('admin')
  await page.goto('/admin/roles')
  const table = page.getByRole('table', { name: m.admin_roles_table({}, ru) })
  for (const name of [m.admin_role_admin({}, ru), m.admin_role_instructor({}, ru), m.admin_role_user({}, ru)]) {
    await expect(table.getByRole('link', { name, exact: true })).toBeVisible()
  }
  await expect(table.getByText(m.admin_role_kind_system({}, ru)).first()).toBeVisible()
})

test('B-ADM-09 a role page groups its permissions by resource; an unknown slug is not found', async ({
  page,
  signInAs,
}) => {
  await signInAs('admin')
  await page.goto('/admin/roles/instructor')
  await expect(page.getByRole('heading', { level: 1, name: m.admin_role_instructor({}, ru) })).toBeVisible()
  await expect(page.getByRole('definition').getByText('course:create:platform')).toBeVisible()
  await expect(page.getByRole('term').getByText('course', { exact: true })).toBeVisible()
  // A system role has no edits: no form to save.
  await expect(page.getByRole('button', { name: m.ui_save({}, ru) })).toHaveCount(0)
  await page.goto(`/admin/roles/nope-${randomUUID().slice(0, 8)}`)
  await expect(page.getByRole('heading', { name: m.admin_role_not_found({}, ru) })).toBeVisible()
})

test('B-ADM-10 a role is made in the dialog; a taken slug lands under its field', async ({ page, role, api, seed }) => {
  await role()
  await page.goto('/admin/roles')
  await page.getByRole('button', { name: m.admin_role_new({}, ru) }).click()
  const dialog = page.getByRole('dialog', { name: m.admin_role_new({}, ru) })
  await dialog.getByLabel(m.admin_role_slug({}, ru)).fill('admin')
  await dialog.getByLabel(m.admin_field_name({}, ru)).fill('E2E дубль')
  await dialog.getByRole('button', { name: m.admin_create_submit({}, ru) }).click()
  await expect(dialog.getByText(m.errors_role_slug_taken({}, ru))).toBeVisible()
  const slug = `e2e-${randomUUID().slice(0, 8)}`
  await dialog.getByLabel(m.admin_role_slug({}, ru)).fill(slug)
  await dialog.getByRole('button', { name: m.admin_create_submit({}, ru) }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'E2E дубль' })).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`/admin/roles/${slug}$`))
  await deleteRole({ client: api, path: { slug }, headers: cookie(seed), throwOnError: true })
})

test('B-ADM-11 a custom role saves its name and its permissions, line by line', async ({ page, role, api, seed }) => {
  const { slug } = await role()
  await page.goto(`/admin/roles/${slug}`)
  const general = page.getByRole('form', { name: m.admin_section_general({}, ru) })
  await general.getByLabel(m.admin_field_name({}, ru)).fill('E2E ассистент')
  await general.getByRole('button', { name: m.ui_save({}, ru) }).click()
  await expect(page.getByText(m.admin_saved({}, ru)).first()).toBeVisible()
  await expect(page.getByRole('heading', { level: 1, name: 'E2E ассистент' })).toBeVisible()

  const grants = page.getByRole('form', { name: m.admin_role_permissions({}, ru) })
  const field = grants.getByLabel(m.admin_role_permissions({}, ru))
  await field.fill('course:read:all\nnot-a-grant')
  await grants.getByRole('button', { name: m.ui_save({}, ru) }).click()
  await expect(grants.getByText(m.validation_invalid({}, ru))).toBeVisible()
  await field.fill('course:read:all\n\n quiz:read:assigned ')
  await grants.getByRole('button', { name: m.ui_save({}, ru) }).click()
  await expect
    .poll(
      async () =>
        (await listRoles({ client: api, headers: cookie(seed) })).data?.find(r => r.slug === slug)?.permissions,
    )
    .toEqual(['course:read:all', 'quiz:read:assigned'])
  await page.reload()
  await expect(field).toHaveValue('course:read:all\nquiz:read:assigned')
})

test("B-ADM-23 a role save over someone else's change asks, keeps the input and retries", async ({
  page,
  role,
  api,
  seed,
}) => {
  const { slug, name: shown } = await role()
  const { data: loaded } = await getRole({ client: api, path: { slug }, headers: cookie(seed), throwOnError: true })
  await page.goto(`/admin/roles/${slug}`)
  const general = page.getByRole('form', { name: m.admin_section_general({}, ru) })
  const name = general.getByLabel(m.admin_field_name({}, ru))
  await expect(name).toHaveValue(shown)
  await name.fill('E2E мой вариант')
  // Another admin saves the role behind the open form.
  await updateRole({
    client: api,
    path: { slug },
    body: { description: 'из другой вкладки' },
    headers: cookie(seed),
    throwOnError: true,
  })
  const sent = page.waitForRequest(request => request.method() === 'PATCH')
  await general.getByRole('button', { name: m.ui_save({}, ru) }).click()
  expect((await sent).headers()['if-match']).toBe(String(loaded.version))
  const conflict = page.getByRole('alertdialog', { name: m.ui_conflict_title({}, ru) })
  await expect(conflict).toBeVisible()
  await conflict.getByRole('button', { name: m.ui_cancel({}, ru) }).click()
  await expect(name).toHaveValue('E2E мой вариант')

  await general.getByRole('button', { name: m.ui_save({}, ru) }).click()
  await conflict.getByRole('button', { name: m.ui_conflict_retry({}, ru) }).click()
  await expect(conflict).toBeHidden()
  await expect(page.getByRole('heading', { level: 1, name: 'E2E мой вариант' })).toBeVisible()
})

test('B-ADM-12 deleting a role asks with its name, then returns to the list', async ({ page, role }) => {
  const { name } = await role()
  await page.goto('/admin/roles')
  await page.getByRole('link', { name }).click()
  await page.getByRole('button', { name: m.admin_delete({}, ru) }).click()
  const confirm = page.getByRole('alertdialog', { name: m.admin_role_delete_title({ name }, ru) })
  await expect(confirm.getByRole('button', { name: m.ui_cancel({}, ru) })).toBeFocused()
  await confirm.getByRole('button', { name: m.admin_delete({}, ru) }).click()
  await expect(page.getByText(m.admin_role_deleted({}, ru))).toBeVisible()
  await expect(page).toHaveURL(/\/admin\/roles$/)
  await expect(page.getByRole('link', { name })).toHaveCount(0)
})

for (const locale of ['kk', 'en'] as const) {
  test(`B-ADM-21 the admin pages speak ${locale}`, async ({ page, context, baseURL, signInAs, seed }) => {
    await signInAs('admin')
    await context.addCookies([{ name: 'ab_locale', value: locale, url: String(baseURL) }])
    const pages = [
      ['/admin/users', m.admin_users_title({}, { locale })],
      ['/admin/roles', m.admin_roles_title({}, { locale })],
      ['/admin/roles/instructor', m.admin_role_instructor({}, { locale })],
      ['/admin/platform', m.admin_platform_title({}, { locale })],
      ['/admin/gamification', m.admin_gamification_title({}, { locale })],
      ['/teach/groups', m.admin_groups_title({}, { locale })],
      [`/teach/groups/${seed.params.groupId}`, 'E2E seed group'],
    ] as const
    for (const [path, title] of pages) {
      await page.goto(path)
      await expect(page.locator('html')).toHaveAttribute('lang', locale)
      await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible()
      await expect(page.locator('body')).not.toContainText(/\b(admin|platform|ui|errors)_[a-z_]+/)
    }
  })
}
