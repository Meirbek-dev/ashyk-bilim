import { randomUUID } from 'node:crypto'

import { m } from '#/paraglide/messages'
import { createClient, createConfig } from '#/shared/api/gen/client'
import { getConfig, getPlatform, updateConfig, updatePlatform } from '#/shared/api/gen/sdk.gen'

import { expect, type Seed, test as base } from '../fixtures/seed'

const ru = { locale: 'ru' } as const
const cookie = (seed: Seed) => {
  const { name, value } = seed.accounts.admin.cookie
  return { cookie: `${name}=${value}` }
}

const test = base.extend<{ api: ReturnType<typeof createClient> }>({
  api: async ({ baseURL }, use) => use(createClient(createConfig({ baseUrl: String(baseURL) }))),
})

// The platform is one object saved with `If-Match`: its tests run one after another, or one's save is the other's 412.
test.describe.configure({ mode: 'default' })

// A 1x1 PNG.
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)

// Only `about` changes (other specs read the platform name and description); it is put back after.
test('B-ADM-13 the platform texts save and survive a reload; a blank name is refused', async ({
  page,
  signInAs,
  api,
  seed,
}) => {
  const { data: before } = await getPlatform({ client: api, throwOnError: true })
  await signInAs('admin')
  try {
    await page.goto('/admin/platform')
    const general = page.getByRole('form', { name: m.admin_section_general({}, ru) })
    await expect(general.getByLabel(m.admin_field_name({}, ru))).toHaveValue(before.name)
    const about = `E2E о платформе ${randomUUID().slice(0, 8)}`
    await general.getByLabel(m.admin_platform_about({}, ru)).fill(about)
    await general.getByRole('button', { name: m.ui_save({}, ru) }).click()
    await expect(page.getByText(m.admin_saved({}, ru))).toBeVisible()
    await page.reload()
    await expect(general.getByLabel(m.admin_platform_about({}, ru))).toHaveValue(about)

    await general.getByLabel(m.admin_field_name({}, ru)).fill('')
    await general.getByRole('button', { name: m.ui_save({}, ru) }).click()
    await expect(general.getByText(m.validation_required({}, ru))).toBeVisible()
  } finally {
    await updatePlatform({ client: api, body: { about: before.about }, headers: cookie(seed), throwOnError: true })
  }
})

test("B-ADM-23 a platform save over someone else's change opens the conflict dialog and keeps the input", async ({
  page,
  signInAs,
  api,
  seed,
}) => {
  const { data: before } = await getPlatform({ client: api, throwOnError: true })
  await signInAs('admin')
  try {
    await page.goto('/admin/platform')
    const general = page.getByRole('form', { name: m.admin_section_general({}, ru) })
    const about = general.getByLabel(m.admin_platform_about({}, ru))
    await expect(about).toHaveValue(before.about)
    await about.fill('E2E мой вариант')
    await updatePlatform({
      client: api,
      body: { about: `E2E другая вкладка ${randomUUID().slice(0, 8)}` },
      headers: cookie(seed),
      throwOnError: true,
    })
    const sent = page.waitForRequest(request => request.method() === 'PATCH')
    await general.getByRole('button', { name: m.ui_save({}, ru) }).click()
    expect((await sent).headers()['if-match']).toBe(String(before.version))
    const conflict = page.getByRole('alertdialog', { name: m.ui_conflict_title({}, ru) })
    await expect(conflict).toBeVisible()
    await conflict.getByRole('button', { name: m.ui_cancel({}, ru) }).click()
    await expect(about).toHaveValue('E2E мой вариант')
  } finally {
    await updatePlatform({ client: api, body: { about: before.about }, headers: cookie(seed), throwOnError: true })
  }
})

test('B-ADM-14 a logo uploads with its purpose and is claimed by "Save"', async ({ page, signInAs }) => {
  await signInAs('admin')
  await page.goto('/admin/platform')
  const branding = page.getByRole('form', { name: m.admin_platform_branding({}, ru) })
  const created = page.waitForRequest(sent => sent.method() === 'POST' && sent.url().endsWith('/api/v2/uploads'))
  const finalized = page.waitForResponse(answer => /\/api\/v2\/uploads\/[^/]+\/finalize$/.test(answer.url()))
  await branding.getByLabel(m.admin_platform_logo({}, ru)).setInputFiles({
    name: 'logo.png',
    mimeType: 'image/png',
    buffer: PIXEL,
  })
  expect((await created).postDataJSON()).toMatchObject({ purpose: 'platform-logo', mime: 'image/png' })
  expect((await finalized).ok()).toBe(true)
  const saved = page.waitForRequest(sent => sent.method() === 'PATCH' && sent.url().endsWith('/api/v2/platform'))
  await branding.getByRole('button', { name: m.ui_save({}, ru) }).click()
  expect((await saved).postDataJSON()).toMatchObject({ logo_upload_id: expect.stringMatching(/^[0-9a-f-]{36}$/) })
  await expect(page.getByText(m.admin_saved({}, ru))).toBeVisible()
  await expect(branding.getByRole('img', { name: m.admin_platform_logo({}, ru) })).toBeVisible()
})

test('B-ADM-15 the XP rules save, survive a reload and keep the overrides the form does not show', async ({
  page,
  signInAs,
  api,
  seed,
}) => {
  const { data: before } = await getConfig({ client: api, headers: cookie(seed), throwOnError: true })
  // A `null` limit is the platform default: the `PUT` leaves it out.
  const restore = { daily_xp_limit: before.daily_xp_limit ?? undefined, rewards: before.rewards }
  await updateConfig({
    client: api,
    body: { ...restore, rewards: { ...before.rewards, admin_award: 3 } },
    headers: cookie(seed),
    throwOnError: true,
  })
  await signInAs('admin')
  try {
    await page.goto('/admin/gamification')
    const course = page.getByLabel(m.admin_xp_course_completion({}, ru))
    await course.fill('250')
    const sent = page.waitForRequest(request => request.method() === 'PUT' && request.url().endsWith('/config'))
    await page.getByRole('button', { name: m.ui_save({}, ru) }).click()
    expect((await sent).postDataJSON()).toMatchObject({ rewards: { admin_award: 3, course_completion: 250 } })
    await expect(page.getByText(m.admin_saved({}, ru))).toBeVisible()
    await page.reload()
    await expect(course).toHaveValue('250')
  } finally {
    await updateConfig({ client: api, body: restore, headers: cookie(seed), throwOnError: true })
  }
})
