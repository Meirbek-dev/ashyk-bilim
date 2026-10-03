import { randomUUID } from 'node:crypto'

import type { Locator } from '@playwright/test'

import { m } from '#/paraglide/messages'
import { createClient, createConfig } from '#/shared/api/gen/client'
import { createCollection, deleteCollection, getCollection, updateCollection } from '#/shared/api/gen/sdk.gen'
import type { Collection, CreateCollectionRequest } from '#/shared/api/gen/types.gen'

import { expect, type Seed, test as base } from '../fixtures/seed'

const ru = { locale: 'ru' } as const

type Owner = 'teacher' | 'admin'
const cookie = (seed: Seed, role: Owner | 'student') => {
  const { name, value } = seed.accounts[role].cookie
  return { cookie: `${name}=${value}` }
}

// Each test makes its own collections through the SDK (as the teacher unless told) and deletes what is left after.
const test = base.extend<{
  api: ReturnType<typeof createClient>
  collection: (body?: Partial<CreateCollectionRequest>, owner?: Owner) => Promise<Collection>
}>({
  api: async ({ baseURL }, use) => use(createClient(createConfig({ baseUrl: String(baseURL) }))),
  collection: async ({ api, seed }, use) => {
    const made: [string, Owner][] = []
    await use(async (body = {}, owner = 'teacher') => {
      const name = `E2E ${randomUUID().slice(0, 8)}`
      const { data } = await createCollection({
        client: api,
        body: { name, public: true, courses: [seed.params.courseId], ...body },
        headers: cookie(seed, owner),
        throwOnError: true,
      })
      made.push([data.id, owner])
      return data
    })
    for (const [id, owner] of made)
      await deleteCollection({ client: api, path: { collection_id: id }, headers: cookie(seed, owner) })
  },
})

const searchBox = () => m.collections_search_label({}, ru)

// A click that lands before hydration (SSR page) or under a view transition does nothing: retry until it acts.
async function clickUntil(target: Locator, outcome: () => Promise<void>): Promise<void> {
  await expect(async () => {
    await target.click()
    await outcome()
  }).toPass()
}

test(
  'B-COL-01 a guest gets the list in the server-rendered document and never sees a hidden collection',
  { tag: '@smoke' },
  async ({ page, collection }) => {
    const hidden = await collection({ public: false })
    const document = await page.request.get('/collections')
    expect(await document.text()).toContain(m.collections_title({}, ru))

    await page.goto(`/collections?q=${encodeURIComponent(hidden.name)}`)
    await expect(page.getByText(m.ui_no_matches({}, ru))).toBeVisible()
    // WebKit reports the lazy chunks of a page left mid-load as a page error: let this one finish first.
    await page.waitForLoadState('networkidle')
    await page.goto(`/collections/${hidden.id}`)
    await expect(page.getByRole('heading', { name: m.collections_not_found({}, ru) })).toBeVisible()
  },
)

test('B-COL-03 the name search lives in the URL', async ({ page, collection }) => {
  const found = await collection()
  await page.goto('/collections')
  await page.getByLabel(searchBox()).fill(found.name)
  await page.getByLabel(searchBox()).press('Enter')
  await expect(page).toHaveURL(new RegExp(`\\?q=${encodeURIComponent(found.name).replaceAll('%20', '(\\+|%20)')}$`))
  await expect(page.getByRole('link', { name: found.name })).toBeVisible()
  await page.reload()
  await expect(page.getByLabel(searchBox())).toHaveValue(found.name)
  await expect(page.getByRole('link', { name: found.name })).toBeVisible()

  await page.getByLabel(searchBox()).fill(`nothing-${randomUUID()}`)
  await page.getByLabel(searchBox()).press('Enter')
  await expect(page.getByText(m.ui_no_matches({}, ru))).toBeVisible()
  await clickUntil(page.getByRole('button', { name: m.ui_reset_filters({}, ru) }), () =>
    expect(page).toHaveURL(/\/collections$/, { timeout: 1000 }),
  )
})

test('B-COL-04 only a user with collection.create gets "New collection"', async ({ page, signInAs }) => {
  const create = page.getByRole('button', { name: m.collections_new({}, ru) })
  await page.goto('/collections')
  await expect(page.getByRole('heading', { name: m.collections_title({}, ru) })).toBeVisible()
  await expect(create).toHaveCount(0)
  await signInAs('student')
  await page.goto('/collections')
  await expect(page.getByRole('heading', { name: m.collections_title({}, ru) })).toBeVisible()
  await expect(create).toHaveCount(0)
  await signInAs('teacher')
  await page.goto('/collections')
  await expect(create).toBeVisible()
})

test('B-COL-05 the author sees "Hidden" on their own hidden collection', async ({ page, signInAs, collection }) => {
  const hidden = await collection({ public: false })
  await signInAs('teacher')
  await page.goto(`/collections?q=${encodeURIComponent(hidden.name)}`)
  await expect(page.getByRole('listitem').getByText(m.collections_visibility_private({}, ru))).toBeVisible()
  await page.goto(`/collections/${hidden.id}`)
  await expect(page.getByText(m.collections_visibility_private({}, ru))).toBeVisible()
})

test('B-COL-06 a teacher creates a collection in the dialog and lands on its page', async ({
  page,
  signInAs,
  api,
  seed,
}) => {
  await signInAs('teacher')
  await page.goto('/collections')
  const dialog = page.getByRole('dialog', { name: m.collections_new({}, ru) })
  await clickUntil(page.getByRole('button', { name: m.collections_new({}, ru) }), () =>
    expect(dialog).toBeVisible({ timeout: 1000 }),
  )
  const create = dialog.getByRole('button', { name: m.collections_create_submit({}, ru) })
  await create.click()
  await expect(dialog.getByText(m.validation_required({}, ru))).toBeVisible()

  const name = `E2E created ${randomUUID().slice(0, 8)}`
  await dialog.getByLabel(m.collections_field_name({}, ru)).fill(name)
  await dialog.getByLabel(m.collections_field_description({}, ru)).fill('Подборка для e2e')
  await dialog.getByRole('switch', { name: m.collections_field_public({}, ru) }).click()
  const request = page.waitForRequest(sent => sent.method() === 'POST' && sent.url().endsWith('/api/v2/collections'))
  await create.click()
  expect((await request).headers()['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/)

  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible()
  await expect(page.getByText(m.collections_created({}, ru))).toBeVisible()
  await expect(page.getByText(m.collections_visibility_private({}, ru))).toBeVisible()
  const path = { collection_id: new URL(page.url()).pathname.split('/').at(-1) ?? '' }
  await deleteCollection({ client: api, path, headers: cookie(seed, 'teacher'), throwOnError: true })
})

test('B-COL-07 the page lists the courses, or says there are none', async ({ page, signInAs, collection, seed }) => {
  const full = await collection()
  const empty = await collection({ courses: [] })
  await page.goto(`/collections/${full.id}`)
  await expect(page.getByRole('heading', { level: 1, name: full.name })).toBeVisible()
  await expect(page.getByRole('link', { name: full.courses[0]?.name })).toHaveAttribute(
    'href',
    `/courses/${seed.params.courseId}`,
  )
  await expect(page.getByText(m.collections_course_count({ count: 1 }, ru), { exact: false })).toBeVisible()
  await signInAs('teacher')
  await page.goto(`/collections/${empty.id}`)
  await expect(page.getByText(m.collections_courses_empty({}, ru))).toBeVisible()
})

test('B-COL-08 edit and delete show only when allowed_actions lists them', async ({ page, signInAs, collection }) => {
  const own = await collection()
  const edit = page.getByRole('link', { name: m.collections_action_update({}, ru) })
  const remove = page.getByRole('button', { name: m.collections_action_delete({}, ru) })
  await signInAs('student')
  await page.goto(`/collections/${own.id}`)
  await expect(page.getByRole('heading', { level: 1, name: own.name })).toBeVisible()
  await expect(edit).toHaveCount(0)
  await expect(remove).toHaveCount(0)
  await signInAs('teacher')
  await page.goto(`/collections/${own.id}`)
  await expect(edit).toBeVisible()
  await expect(remove).toBeVisible()
})

test('B-COL-09 the edit page saves with If-Match and returns to the collection', async ({
  page,
  signInAs,
  collection,
}) => {
  const own = await collection()
  await signInAs('teacher')
  await page.goto(`/collections/${own.id}`)
  await page.getByRole('link', { name: m.collections_action_update({}, ru) }).click()
  await expect(page).toHaveURL(new RegExp(`/collections/${own.id}/edit$`))
  const name = page.getByLabel(m.collections_field_name({}, ru))
  await expect(name).toHaveValue(own.name)
  await name.fill(`${own.name} v2`)
  const request = page.waitForRequest(sent => sent.method() === 'PATCH')
  await page.getByRole('button', { name: m.ui_save({}, ru) }).click()
  expect((await request).headers()['if-match']).toBe(String(own.version))
  await expect(page).toHaveURL(new RegExp(`/collections/${own.id}$`))
  await expect(page.getByRole('heading', { level: 1, name: `${own.name} v2` })).toBeVisible()
  await expect(page.getByText(m.collections_saved({}, ru))).toBeVisible()
})

test("B-COL-10 a save over someone else's change asks, keeps the input and retries", async ({
  page,
  signInAs,
  collection,
  api,
  seed,
}) => {
  const own = await collection()
  await signInAs('teacher')
  await page.goto(`/collections/${own.id}/edit`)
  const description = page.getByLabel(m.collections_field_description({}, ru))
  await description.fill('Мой вариант описания')
  await updateCollection({
    client: api,
    path: { collection_id: own.id },
    body: { name: `${own.name} (другая вкладка)` },
    headers: { ...cookie(seed, 'teacher'), 'If-Match': own.version },
    throwOnError: true,
  })
  await page.getByRole('button', { name: m.ui_save({}, ru) }).click()
  const conflict = page.getByRole('alertdialog', { name: m.ui_conflict_title({}, ru) })
  await expect(conflict).toBeVisible()
  await conflict.getByRole('button', { name: m.ui_cancel({}, ru) }).click()
  await expect(description).toHaveValue('Мой вариант описания')

  await page.getByRole('button', { name: m.ui_save({}, ru) }).click()
  await conflict.getByRole('button', { name: m.ui_conflict_retry({}, ru) }).click()
  await expect(page).toHaveURL(new RegExp(`/collections/${own.id}$`))
  await expect(page.getByText('Мой вариант описания')).toBeVisible()
})

test('B-COL-11 editing without the right is "no access" in place; a guest signs in first', async ({
  page,
  signInAs,
  collection,
}) => {
  const own = await collection()
  const path = `/collections/${own.id}/edit`
  await page.goto(path)
  await expect(page).toHaveURL(/\/login\?redirect=/)
  await signInAs('student')
  await page.goto(path)
  await expect(page.getByRole('heading', { name: m.platform_forbidden_title({}, ru) })).toBeVisible()
  expect(new URL(page.url()).pathname).toBe(path)
})

test('B-COL-12 delete asks with the name, starts on Cancel, then shows the list', async ({
  page,
  signInAs,
  collection,
  api,
  seed,
}) => {
  const own = await collection()
  await signInAs('teacher')
  await page.goto(`/collections/${own.id}`)
  const confirm = page.getByRole('alertdialog', { name: m.collections_delete_title({ name: own.name }, ru) })
  await clickUntil(page.getByRole('button', { name: m.collections_action_delete({}, ru) }), () =>
    expect(confirm).toBeVisible({ timeout: 1000 }),
  )
  await expect(confirm.getByRole('button', { name: m.ui_cancel({}, ru) })).toBeFocused()
  await confirm.getByRole('button', { name: m.collections_action_delete({}, ru) }).click()
  await expect(page).toHaveURL(/\/collections$/)
  await expect(page.getByText(m.collections_deleted({}, ru))).toBeVisible()
  const gone = await getCollection({ client: api, path: { collection_id: own.id }, headers: cookie(seed, 'teacher') })
  expect(gone.response?.status).toBe(404)
})

test('B-COL-13 a long unbroken name wraps on a phone', async ({ page, signInAs, collection }) => {
  const long = await collection({ name: `E2E${'Ж'.repeat(80)}` })
  await signInAs('teacher')
  await page.setViewportSize({ width: 390, height: 844 })
  for (const path of [
    `/collections/${long.id}`,
    `/collections/${long.id}/edit`,
    `/collections?q=E2E${'Ж'.repeat(20)}`,
  ]) {
    await page.goto(path)
    await expect(page.getByRole('main')).toBeVisible()
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow, path).toBe(0)
  }
})

for (const locale of ['kk', 'en'] as const) {
  test(`B-COL-14 the collection pages speak ${locale}`, async ({ page, context, baseURL, signInAs, collection }) => {
    const own = await collection()
    await signInAs('teacher')
    await context.addCookies([{ name: 'ab_locale', value: locale, url: String(baseURL) }])
    const pages = [
      ['/collections', m.collections_title({}, { locale })],
      [`/collections/${own.id}`, own.name],
      [`/collections/${own.id}/edit`, m.collections_edit_title({}, { locale })],
    ] as const
    for (const [path, title] of pages) {
      await page.goto(path)
      await expect(page.locator('html')).toHaveAttribute('lang', locale)
      await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible()
      await expect(page.locator('body')).not.toContainText(/\b(collections|platform|ui|errors)_[a-z_]+/)
    }
  })
}
