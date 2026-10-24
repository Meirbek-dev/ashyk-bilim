import { randomUUID } from 'node:crypto'

import { m } from '#/paraglide/messages'
import { createClient, createConfig } from '#/shared/api/gen/client'
import { createCollection, createCourse, deleteCollection, deleteCourse } from '#/shared/api/gen/sdk.gen'

import { expect, test } from '../fixtures/seed'
import { finishPages } from '../fixtures/test'

const ru = { locale: 'ru' } as const

test('B-COL-15 the edit page picks the courses by name and saves them in order', async ({
  page,
  signInAs,
  seed,
  baseURL,
}) => {
  const api = createClient(createConfig({ baseUrl: String(baseURL) }))
  const { name, value } = seed.accounts.teacher.cookie
  const headers = { cookie: `${name}=${value}` }
  const { data: own } = await createCollection({
    client: api,
    body: { name: `E2E ${randomUUID().slice(0, 8)}`, public: true, courses: [] },
    headers,
    throwOnError: true,
  })
  await signInAs('teacher')
  await page.goto(`/collections/${own.id}/edit`)
  await page.getByRole('combobox', { name: m.collections_field_courses({}, ru) }).fill('E2E seed course')
  await page.getByRole('option', { name: 'E2E seed course' }).first().click()
  await page.keyboard.press('Escape')
  const request = page.waitForRequest(sent => sent.method() === 'PATCH')
  await page.getByRole('button', { name: m.ui_save({}, ru) }).click()
  expect((await request).postDataJSON()).toMatchObject({ courses: [seed.params.courseId] })
  await expect(page).toHaveURL(new RegExp(`/collections/${own.id}$`))
  await expect(page.getByRole('link', { name: 'E2E seed course' })).toBeVisible()
  await expect(page.getByText(m.collections_hidden_warning({}, ru))).toHaveCount(0)
  await finishPages(page.context())
  await deleteCollection({ client: api, path: { collection_id: own.id }, headers })
})

test('B-COL-16 saving a public collection whose courses are all closed warns that nobody else sees it', async ({
  page,
  signInAs,
  seed,
  baseURL,
}) => {
  const api = createClient(createConfig({ baseUrl: String(baseURL) }))
  const { name, value } = seed.accounts.teacher.cookie
  const headers = { cookie: `${name}=${value}` }
  // A new course stays private until it is published.
  const { data: course } = await createCourse({
    client: api,
    body: { name: `E2E closed ${randomUUID().slice(0, 8)}` },
    headers,
    throwOnError: true,
  })
  const { data: own } = await createCollection({
    client: api,
    body: { name: `E2E ${randomUUID().slice(0, 8)}`, public: true, courses: [course.id] },
    headers,
    throwOnError: true,
  })
  await signInAs('teacher')
  await page.goto(`/collections/${own.id}/edit`)
  await page.getByRole('button', { name: m.ui_save({}, ru) }).click()
  await expect(page).toHaveURL(new RegExp(`/collections/${own.id}$`))
  await expect(page.getByText(m.collections_hidden_warning({}, ru))).toBeVisible()
  await finishPages(page.context())
  await deleteCollection({ client: api, path: { collection_id: own.id }, headers })
  await deleteCourse({ client: api, path: { course_id: course.id }, headers })
})

const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)

test('B-COL-17 a picked cover becomes the collection cover at once and shows on its page', async ({
  page,
  signInAs,
  seed,
  baseURL,
}) => {
  const api = createClient(createConfig({ baseUrl: String(baseURL) }))
  const { name, value } = seed.accounts.teacher.cookie
  const headers = { cookie: `${name}=${value}` }
  const { data: own } = await createCollection({
    client: api,
    body: { name: `E2E ${randomUUID().slice(0, 8)}`, public: true, courses: [] },
    headers,
    throwOnError: true,
  })
  await signInAs('teacher')
  await page.goto(`/collections/${own.id}/edit`)
  const saved = page.waitForRequest(sent => sent.method() === 'PATCH')
  await page.getByLabel(m.collections_cover_field({}, ru)).setInputFiles({
    name: 'cover.png',
    mimeType: 'image/png',
    buffer: PIXEL,
  })
  expect((await saved).postDataJSON()).toMatchObject({ cover_upload_id: expect.stringMatching(/^[0-9a-f-]{36}$/) })
  await expect(page.getByRole('img', { name: m.collections_cover_title({}, ru) })).toBeVisible()
  // The name form below still saves: the cover moved its base version.
  await page.getByRole('button', { name: m.ui_save({}, ru) }).click()
  await expect(page).toHaveURL(new RegExp(`/collections/${own.id}$`))
  await expect(page.locator('main img[src^="/content/"]')).toBeVisible()
  await finishPages(page.context())
  await deleteCollection({ client: api, path: { collection_id: own.id }, headers })
})
