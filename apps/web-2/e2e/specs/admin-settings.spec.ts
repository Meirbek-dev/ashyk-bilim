import { randomUUID } from 'node:crypto'
import { expectFailure } from '../fixtures/test'

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
    await general.getByLabel(m.admin_platform_about({}, ru), { exact: true }).fill(about)
    await general.getByRole('button', { name: m.ui_save({}, ru) }).click()
    await expect(page.getByText(m.admin_saved({}, ru))).toBeVisible()
    await page.reload()
    await expect(general.getByLabel(m.admin_platform_about({}, ru), { exact: true })).toHaveValue(about)

    await general.getByLabel(m.admin_field_name({}, ru)).fill('')
    expectFailure(page, /^\/api\/v2\/platform$/, 422)
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
    const about = general.getByLabel(m.admin_platform_about({}, ru), { exact: true })
    await expect(about).toHaveValue(before.about)
    await about.fill('E2E мой вариант')
    await updatePlatform({
      client: api,
      body: { about: `E2E другая вкладка ${randomUUID().slice(0, 8)}` },
      headers: cookie(seed),
      throwOnError: true,
    })
    const sent = page.waitForRequest(request => request.method() === 'PATCH')
    expectFailure(page, /^\/api\/v2\/platform$/, 412)
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

test('B-ADM-14 a link cover uploads with its purpose and becomes the cover at once; no logo picker', async ({
  page,
  signInAs,
}) => {
  await signInAs('admin')
  await page.goto('/admin/platform')
  const branding = page.getByRole('form', { name: m.admin_platform_branding({}, ru) })
  // The section saves itself: it has no Save button of its own.
  await expect(branding.getByRole('button', { name: m.ui_save({}, ru) })).toHaveCount(0)
  const created = page.waitForRequest(sent => sent.method() === 'POST' && sent.url().endsWith('/api/v2/uploads'))
  const finalized = page.waitForResponse(answer => /\/api\/v2\/uploads\/[^/]+\/finalize$/.test(answer.url()))
  // No «Сохранить»: the picked image is claimed as soon as it is uploaded.
  const saved = page.waitForRequest(sent => sent.method() === 'PATCH' && sent.url().endsWith('/api/v2/platform'))
  await branding.getByLabel(m.admin_platform_thumbnail({}, ru)).setInputFiles({
    name: 'cover.png',
    mimeType: 'image/png',
    buffer: PIXEL,
  })
  expect((await created).postDataJSON()).toMatchObject({ purpose: 'platform-thumbnail', mime: 'image/png' })
  expect((await finalized).ok()).toBe(true)
  expect((await saved).postDataJSON()).toMatchObject({ thumbnail_upload_id: expect.stringMatching(/^[0-9a-f-]{36}$/) })
  await expect(page.getByText(m.admin_saved({}, ru))).toBeVisible()
  await expect(branding.getByRole('img', { name: m.admin_platform_thumbnail({}, ru) })).toBeVisible()
  // OPEN-C-1: the shell keeps the fixed artwork, so no logo is offered.
  await expect(branding.getByText('Логотип')).toHaveCount(0)
})

test('B-ADM-15 B-ADM-24 the XP rules save over a newer version after the conflict dialog, survive a reload and keep the overrides the form does not show', async ({
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
    // Each field names the platform default it falls back to when left blank.
    await expect(course).toHaveAccessibleDescription(m.admin_gamification_default({ value: '200' }, ru))
    await course.fill('250')
    expectFailure(page, /^\/api\/v2\/gamification\/config$/, 412)
    // Someone saves the rules after this page read them: the page's version is stale (412). The retry sends the
    // input over the newer version, with the overrides the form does not show as that save left them.
    await updateConfig({
      client: api,
      body: { ...restore, rewards: { ...before.rewards, admin_award: 4 } },
      headers: cookie(seed),
      throwOnError: true,
    })
    await page.getByRole('button', { name: m.ui_save({}, ru) }).click()
    const conflict = page.getByRole('alertdialog', { name: m.ui_conflict_title({}, ru) })
    const sent = page.waitForRequest(request => request.method() === 'PUT' && request.url().endsWith('/config'))
    await conflict.getByRole('button', { name: m.ui_conflict_retry({}, ru) }).click()
    expect((await sent).postDataJSON()).toMatchObject({ rewards: { admin_award: 4, course_completion: 250 } })
    await expect(page.getByText(m.admin_saved({}, ru))).toBeVisible()
    await page.reload()
    await expect(course).toHaveValue('250')
  } finally {
    await updateConfig({ client: api, body: restore, headers: cookie(seed), throwOnError: true })
  }
})
