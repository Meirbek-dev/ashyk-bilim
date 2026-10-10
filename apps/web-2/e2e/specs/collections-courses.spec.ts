import { randomUUID } from 'node:crypto'

import { m } from '#/paraglide/messages'
import { createClient, createConfig } from '#/shared/api/gen/client'
import { createCollection, deleteCollection } from '#/shared/api/gen/sdk.gen'

import { expect, test } from '../fixtures/seed'

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
  await deleteCollection({ client: api, path: { collection_id: own.id }, headers })
})
