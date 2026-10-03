import { randomUUID } from 'node:crypto'

import type { Locator, Page } from '@playwright/test'

import { m } from '#/paraglide/messages'
import { createClient, createConfig } from '#/shared/api/gen/client'
import { createCourse, deleteCourse, getPlatform } from '#/shared/api/gen/sdk.gen'
import type { Course } from '#/shared/api/gen/types.gen'

import { expect, type Seed, test as base } from '../fixtures/seed'

const ru = { locale: 'ru' } as const
const SEED_COURSE = 'E2E seed course'

const cookie = (seed: Seed, role: 'teacher' | 'student') => {
  const { name, value } = seed.accounts[role].cookie
  return { cookie: `${name}=${value}` }
}

// A course made through the SDK is the teacher's private draft: visible to the teacher only. Deleted after the test.
const test = base.extend<{ api: ReturnType<typeof createClient>; draftCourse: () => Promise<Course> }>({
  api: async ({ baseURL }, use) => use(createClient(createConfig({ baseUrl: String(baseURL) }))),
  draftCourse: async ({ api, seed }, use) => {
    const made: string[] = []
    await use(async () => {
      const name = `E2E draft ${randomUUID().slice(0, 8)}`
      const { data } = await createCourse({
        client: api,
        body: { name, description: 'Черновик для e2e' },
        headers: cookie(seed, 'teacher'),
        throwOnError: true,
      })
      made.push(data.id)
      return data
    })
    for (const id of made)
      await deleteCourse({ client: api, path: { course_id: id }, headers: cookie(seed, 'teacher') })
  },
})

// A click or a key press that lands before hydration (SSR page) does nothing: retry until it acts.
async function untilActs(act: () => Promise<void>, outcome: () => Promise<void>): Promise<void> {
  await expect(async () => {
    await act()
    await outcome()
  }).toPass()
}

const palette = (page: Page) => page.getByRole('dialog', { name: m.catalog_palette_title({}, ru) })
async function openPalette(page: Page): Promise<Locator> {
  await untilActs(
    () => page.keyboard.press('Control+k'),
    () => expect(palette(page)).toBeVisible({ timeout: 1000 }),
  )
  return palette(page)
}

test(
  'B-CAT-01 a guest gets the landing in the server-rendered document; a signed-in user goes home',
  {
    tag: '@smoke',
  },
  async ({ page, api, signInAs }) => {
    const { data: platform } = await getPlatform({ client: api, throwOnError: true })
    const document = await (await page.request.get('/')).text()
    expect(document).toContain(platform.name)
    expect(document).toContain(platform.description || m.catalog_landing_lead({}, ru))
    await signInAs('student')
    await page.goto('/')
    await expect(page).toHaveURL(/\/home$/)
  },
)

test('B-CAT-02 the landing says how to start and leads to the catalog', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: m.catalog_landing_start_title({}, ru) })).toBeVisible()
  await expect(page.getByRole('link', { name: m.catalog_landing_signup({}, ru) })).toHaveAttribute('href', '/signup')
  await expect(page.getByRole('link', { name: SEED_COURSE }).first()).toBeVisible()
  await untilActs(
    () => page.getByRole('link', { name: m.catalog_landing_all_courses({}, ru) }).click(),
    () => expect(page).toHaveURL(/\/courses$/, { timeout: 1000 }),
  )
  await expect(page.getByRole('heading', { level: 1, name: m.catalog_courses_title({}, ru) })).toBeVisible()
})

test("B-CAT-03 the catalog is public, server-rendered, and marks the author's draft", async ({
  page,
  seed,
  signInAs,
  draftCourse,
}) => {
  const document = await (await page.request.get('/courses')).text()
  expect(document).toContain(SEED_COURSE)
  const draft = await draftCourse()
  await page.goto(`/courses?q=${encodeURIComponent(draft.name)}`)
  await expect(page.getByText(m.ui_no_matches({}, ru))).toBeVisible()

  await signInAs('teacher')
  await page.goto(`/courses?q=${encodeURIComponent(draft.name)}`)
  const card = page.getByRole('listitem').filter({ hasText: draft.name })
  await expect(card.getByRole('link', { name: draft.name })).toHaveAttribute('href', `/courses/${draft.id}`)
  await expect(card.getByText(m.catalog_course_state_unpublished({}, ru))).toBeVisible()
  await page.goto(`/courses?q=${encodeURIComponent(SEED_COURSE)}`)
  await expect(page.getByRole('link', { name: SEED_COURSE })).toHaveAttribute(
    'href',
    `/courses/${seed.params.courseId}`,
  )
  await expect(page.getByText(m.catalog_course_state_unpublished({}, ru))).toHaveCount(0)
})

test('B-CAT-05 the catalog search lives in the URL', async ({ page }) => {
  const box = page.getByLabel(m.catalog_courses_search_label({}, ru))
  await page.goto('/courses')
  await untilActs(
    async () => {
      await box.fill(SEED_COURSE)
      await box.press('Enter')
    },
    () => expect(page).toHaveURL(/\?q=E2E(\+|%20)seed(\+|%20)course$/, { timeout: 1000 }),
  )
  await expect(page.getByRole('link', { name: SEED_COURSE })).toBeVisible()
  await page.reload()
  await expect(box).toHaveValue(SEED_COURSE)

  await box.fill(`nothing-${randomUUID()}`)
  await box.press('Enter')
  await expect(page.getByText(m.ui_no_matches({}, ru))).toBeVisible()
  await untilActs(
    () => page.getByRole('button', { name: m.ui_reset_filters({}, ru) }).click(),
    () => expect(page).toHaveURL(/\/courses$/, { timeout: 1000 }),
  )
  await expect(page.getByRole('link', { name: SEED_COURSE })).toBeVisible()
})

test('B-CAT-06 the sort is in the URL and offers "in progress first" only to a signed-in user', async ({
  page,
  signInAs,
}) => {
  const trigger = (sort: string) => page.getByRole('button', { name: m.catalog_sort_label({ sort }, ru) })
  await page.goto('/courses?sort=progress')
  await untilActs(
    () => trigger(m.catalog_sort_updated({}, ru)).click(),
    () => expect(page.getByRole('menu')).toBeVisible({ timeout: 1000 }),
  )
  await expect(page.getByRole('menuitemradio')).toHaveText([
    m.catalog_sort_updated({}, ru),
    m.catalog_sort_name({}, ru),
  ])
  await page.getByRole('menuitemradio', { name: m.catalog_sort_name({}, ru) }).click()
  await expect(page).toHaveURL(/\?sort=name$/)
  await expect(trigger(m.catalog_sort_name({}, ru))).toBeVisible()

  await signInAs('student')
  await page.goto('/courses?sort=bogus')
  await expect(trigger(m.catalog_sort_progress({}, ru))).toBeVisible()
})

test('B-CAT-07 search shows every section of one answer, filtered by ?kind=', async ({ page, signInAs }) => {
  await signInAs('student')
  await page.goto(`/search?q=${encodeURIComponent('E2E seed')}&kind=bogus`)
  const kinds = page.getByRole('navigation', { name: m.catalog_search_kinds_label({}, ru) })
  await expect(kinds.getByRole('link', { name: m.catalog_search_kind_all({}, ru) })).toHaveAttribute(
    'aria-current',
    'page',
  )
  await expect(page.getByRole('heading', { level: 2, name: m.catalog_search_kind_courses({}, ru) })).toBeVisible()
  await expect(page.getByRole('heading', { level: 2, name: m.catalog_search_kind_collections({}, ru) })).toBeVisible()
  await untilActs(
    () => kinds.getByRole('link', { name: new RegExp(`^${m.catalog_search_kind_collections({}, ru)}`) }).click(),
    () => expect(page).toHaveURL(/kind=collections/, { timeout: 1000 }),
  )
  await expect(page.getByRole('heading', { level: 2, name: m.catalog_search_kind_courses({}, ru) })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'E2E seed collection' }).first()).toBeVisible()
})

test('B-CAT-08 a guest gets no people section', async ({ page, signInAs }) => {
  const people = () =>
    page
      .getByRole('navigation', { name: m.catalog_search_kinds_label({}, ru) })
      .getByRole('link', { name: new RegExp(`^${m.catalog_search_kind_users({}, ru)}`) })
  await page.goto('/search?q=e2e')
  await expect(page.getByRole('link', { name: m.catalog_search_kind_all({}, ru) })).toBeVisible()
  await expect(people()).toHaveCount(0)
  await signInAs('student')
  await page.goto('/search?q=e2e')
  await expect(people()).toBeVisible()
})

test('B-CAT-09 no query invites one; punctuation alone finds nothing without an error', async ({ page }) => {
  await page.goto('/search')
  await expect(page.getByText(m.catalog_search_prompt({}, ru))).toBeVisible()
  await page.goto(`/search?q=${encodeURIComponent('!@#$%^&*()')}`)
  await expect(page.getByText(m.ui_no_matches({}, ru))).toBeVisible()
  await untilActs(
    () => page.getByRole('button', { name: m.ui_reset_filters({}, ru) }).click(),
    () => expect(page).toHaveURL(/\/search$/, { timeout: 1000 }),
  )
  await expect(page.getByText(m.catalog_search_prompt({}, ru))).toBeVisible()
})

test('B-CAT-10 Ctrl+K and the top-bar button open the palette; Escape closes it', async ({ page }) => {
  await page.goto('/courses')
  const dialog = await openPalette(page)
  await expect(dialog.getByRole('combobox')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await page.getByRole('button', { name: m.catalog_palette_title({}, ru) }).click()
  await expect(dialog).toBeVisible()
})

test('B-CAT-11 the palette offers only the sections the user may open', async ({ page, signInAs }) => {
  await signInAs('student')
  await page.goto('/home')
  const dialog = await openPalette(page)
  await expect(dialog.getByRole('option', { name: m.platform_nav_learning({}, ru) })).toBeVisible()
  await expect(dialog.getByRole('option', { name: m.platform_nav_inbox({}, ru) })).toHaveCount(0)
  await dialog.getByRole('combobox').fill(m.platform_nav_learning({}, ru))
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/learning$/)
  await expect(dialog).toBeHidden()
})

test('B-CAT-12 typing searches; a hit opens its page, "all results" opens the search', async ({ page, seed }) => {
  await page.goto('/courses')
  let dialog = await openPalette(page)
  await dialog.getByRole('combobox').fill(SEED_COURSE)
  await dialog.getByRole('option', { name: SEED_COURSE, exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/courses/${seed.params.courseId}`))

  dialog = await openPalette(page)
  await dialog.getByRole('combobox').fill('E2E seed')
  await dialog.getByRole('option', { name: m.catalog_palette_all_results({ q: 'E2E seed' }, ru) }).click()
  await expect(page).toHaveURL(/\/search\?q=E2E(\+|%20)seed$/)
})

test('B-CAT-13 "?" and the palette entry show the shortcut list', async ({ page }) => {
  const help = page.getByRole('dialog', { name: m.catalog_help_title({}, ru) })
  await page.goto('/courses')
  await untilActs(
    () => page.keyboard.press('Shift+?'),
    () => expect(help).toBeVisible({ timeout: 1000 }),
  )
  await expect(help.getByText(m.catalog_shortcut_palette({}, ru))).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(help).toBeHidden()
  const dialog = await openPalette(page)
  await dialog.getByRole('option', { name: m.catalog_shortcut_help({}, ru) }).click()
  await expect(help.getByText(m.catalog_shortcut_palette({}, ru))).toBeVisible()
})

for (const locale of ['kk', 'en'] as const) {
  test(`B-CAT-14 the landing, catalog and search speak ${locale}`, async ({ page, context, baseURL }) => {
    await context.addCookies([{ name: 'ab_locale', value: locale, url: String(baseURL) }])
    const pages = [
      ['/', m.catalog_landing_start_title({}, { locale }), 2],
      ['/courses', m.catalog_courses_title({}, { locale }), 1],
      ['/search?q=e2e', m.catalog_search_title({}, { locale }), 1],
    ] as const
    for (const [path, heading, level] of pages) {
      await page.goto(path)
      await expect(page.locator('html')).toHaveAttribute('lang', locale)
      await expect(page.getByRole('heading', { level, name: heading })).toBeVisible()
      await expect(page.locator('body')).not.toContainText(/\b(catalog|platform|ui|errors)_[a-z_]+/)
    }
  })
}
