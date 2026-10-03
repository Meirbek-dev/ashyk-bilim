import { m } from '#/paraglide/messages'
import { createUpload, finalizeUpload, getCourse, updateCourse } from '#/shared/api/gen/sdk.gen'
import type { CreateUploadRequest } from '#/shared/api/gen/types.gen'

import { cookieOf, expect, ru, test } from './course-studio-fixture'

// The `settings` tab and the announcements of `publish` (slice 4.1).

const tab = (courseId: string, name: string) => `/teach/courses/${courseId}/${name}`

// The smallest PNG: one transparent pixel.
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
)

test.beforeEach(async ({ signInAs }) => signInAs('teacher'))

test('B-CST-19 details save with their own button; an empty name stays on the field', async ({
  page,
  studio,
  seed,
}) => {
  const { course } = await studio.course()
  await page.goto(tab(course.id, 'settings'))
  const section = page.getByRole('form', { name: m.studio_details_title({}, ru) })
  const name = section.getByRole('textbox', { name: m.studio_field_name({}, ru) })
  await name.fill('')
  await section.getByRole('button', { name: m.ui_save({}, ru) }).click()
  await expect(section.getByText(m.validation_required({}, ru))).toBeVisible()
  await name.fill(`${course.name} (новое)`)
  await section.getByRole('textbox', { name: m.studio_field_about({}, ru) }).fill('Коротко о курсе')
  await section
    .getByRole('textbox', { name: m.studio_field_description({}, ru), exact: true })
    .fill('Подробное описание')
  await section.getByRole('switch', { name: m.studio_field_open({}, ru) }).click()
  await section.getByRole('button', { name: m.ui_save({}, ru) }).click()
  await expect(page.getByText(m.studio_saved({}, ru))).toBeVisible()
  await expect(page.getByRole('heading', { level: 1, name: `${course.name} (новое)` })).toBeVisible()
  const headers = cookieOf(seed, 'teacher')
  const { data } = await getCourse({ client: studio.api, path: { course_id: course.id }, headers, throwOnError: true })
  expect(data).toMatchObject({ about: 'Коротко о курсе', open_to_contributors: true })
  expect(data.description).toContain('Подробное описание')
})

test('B-CST-32 a details save over someone else’s opens the conflict dialog; retry keeps the input', async ({
  page,
  studio,
  seed,
}) => {
  const { course } = await studio.course()
  await page.goto(tab(course.id, 'settings'))
  const section = page.getByRole('form', { name: m.studio_details_title({}, ru) })
  const about = section.getByRole('textbox', { name: m.studio_field_about({}, ru) })
  await expect(about).toBeEnabled()
  const headers = cookieOf(seed, 'teacher')
  const path = { course_id: course.id }
  await updateCourse({
    client: studio.api,
    path,
    body: { name: `${course.name} (чужое)` },
    headers: { ...headers, 'If-Match': course.version },
    throwOnError: true,
  })
  await about.fill('Моя правка')
  await section.getByRole('button', { name: m.ui_save({}, ru) }).click()
  const dialog = page.getByRole('alertdialog', { name: m.ui_conflict_title({}, ru) })
  await dialog.getByRole('button', { name: m.ui_conflict_retry({}, ru) }).click()
  await expect(page.getByText(m.studio_saved({}, ru))).toBeVisible()
  await expect(dialog).toBeHidden()
  const { data } = await getCourse({ client: studio.api, path, headers, throwOnError: true })
  expect(data.about).toBe('Моя правка')
  expect(data.version).toBeGreaterThan(course.version + 1)
})

test('B-CST-20 the cover is shown and can be removed', async ({ page, studio, seed }) => {
  const { course } = await studio.course()
  const headers = cookieOf(seed, 'teacher')
  const body: CreateUploadRequest = { purpose: 'course-thumbnail', mime: 'image/png', size_bytes: PIXEL.length }
  const slot = await createUpload({ client: studio.api, body, headers, throwOnError: true })
  // Straight to storage, as the browser would (the presigned PUT is not an API call).
  await page.request.put(slot.data.put_url, {
    data: PIXEL,
    headers: { 'content-type': 'image/png', 'if-none-match': '*' },
  })
  const path = { upload_id: slot.data.id }
  const idempotency = { 'Idempotency-Key': slot.data.id }
  await finalizeUpload({ client: studio.api, path, headers: { ...headers, ...idempotency }, throwOnError: true })
  const thumbnail = { thumbnail_upload_id: slot.data.id }
  await updateCourse({
    client: studio.api,
    path: { course_id: course.id },
    body: thumbnail,
    headers,
    throwOnError: true,
  })
  await page.goto(tab(course.id, 'settings'))
  await expect(page.getByRole('img', { name: m.studio_thumbnail_alt({}, ru) })).toBeVisible()
  await expect(page.getByText(m.studio_thumbnail_types({}, ru))).toBeVisible()
  await page.getByRole('button', { name: m.studio_thumbnail_remove({}, ru) }).click()
  await expect(page.getByText(m.studio_thumbnail_removed({}, ru))).toBeVisible()
  await expect(page.getByText(m.studio_thumbnail_none({}, ru))).toBeVisible()
})

test('B-CST-21 the certificate is switched on, configured, and switched off', async ({ page, studio }) => {
  const { course } = await studio.course()
  await page.goto(tab(course.id, 'settings'))
  await page.getByRole('button', { name: m.studio_certificate_enable({}, ru) }).click()
  await expect(page.getByText(m.studio_certificate_enabled({}, ru))).toBeVisible()
  const form = page.getByRole('form', { name: m.studio_certificate_title({}, ru) })
  await form.getByRole('textbox', { name: m.studio_certificate_name({}, ru) }).fill('Сертификат e2e')
  await form.getByRole('combobox', { name: m.studio_certificate_type({}, ru) }).selectOption('mastery')
  await form.getByRole('textbox', { name: m.studio_certificate_instructor({}, ru) }).fill('Мейірбек')
  await form.getByRole('button', { name: m.ui_save({}, ru) }).click()
  await expect(page.getByText(m.studio_saved({}, ru))).toBeVisible()
  await page.reload()
  await expect(form.getByRole('textbox', { name: m.studio_certificate_name({}, ru) })).toHaveValue('Сертификат e2e')
  await expect(form.getByRole('combobox', { name: m.studio_certificate_type({}, ru) })).toHaveValue('mastery')
  await page.getByRole('button', { name: m.studio_certificate_disable({}, ru) }).click()
  const confirm = page.getByRole('alertdialog')
  await confirm.getByRole('button', { name: m.studio_certificate_disable({}, ru) }).click()
  await expect(page.getByText(m.studio_certificate_disabled({}, ru))).toBeVisible()
  await expect(page.getByRole('button', { name: m.studio_certificate_enable({}, ru) })).toBeVisible()
})

test('B-CST-22 archiving names what stays behind; an archived course can be restored', async ({ page, studio }) => {
  const { course } = await studio.course()
  await page.goto(tab(course.id, 'settings'))
  await page.getByRole('button', { name: m.studio_archive({}, ru) }).click()
  const confirm = page.getByRole('alertdialog', { name: m.studio_archive_confirm_title({ name: course.name }, ru) })
  await expect(confirm.getByText(/Записано учащихся: 0/)).toBeVisible()
  await expect(confirm.getByRole('button', { name: m.ui_cancel({}, ru) })).toBeFocused()
  await confirm.getByRole('button', { name: m.studio_archive({}, ru) }).click()
  await expect(page.getByText(m.studio_archived({}, ru))).toBeVisible()
  await expect(page.getByText(m.studio_status_archived({}, ru)).first()).toBeVisible()
  await page.getByRole('button', { name: m.studio_restore({}, ru) }).click()
  await expect(page.getByText(m.studio_restored({}, ru))).toBeVisible()
  await expect(page.getByText(m.studio_status_draft({}, ru)).first()).toBeVisible()
})

test('B-CST-25 announcements are created, edited in place and deleted', async ({ page, studio }) => {
  const { course } = await studio.course()
  await page.goto(tab(course.id, 'publish'))
  await expect(page.getByText(m.studio_updates_empty({}, ru))).toBeVisible()
  await page.getByRole('button', { name: m.studio_update_new({}, ru) }).click()
  const dialog = page.getByRole('dialog', { name: m.studio_update_new({}, ru) })
  await dialog.getByRole('textbox', { name: m.studio_update_field_title({}, ru) }).fill('Старт курса')
  await dialog.getByRole('textbox', { name: m.studio_update_field_content({}, ru) }).fill('Начинаем **в понедельник**')
  await dialog.getByRole('button', { name: m.studio_create_submit({}, ru) }).click()
  await expect(page.getByText(m.studio_update_created({}, ru))).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Старт курса' })).toBeVisible()
  await expect(page.locator('strong', { hasText: 'в понедельник' })).toBeVisible()
  await page.getByRole('button', { name: m.studio_update_edit_named({ title: 'Старт курса' }, ru) }).click()
  const form = page.getByRole('form', { name: 'Старт курса' })
  await form.getByRole('textbox', { name: m.studio_update_field_title({}, ru) }).fill('Старт переносится')
  await form.getByRole('button', { name: m.ui_save({}, ru) }).click()
  await expect(page.getByRole('heading', { name: 'Старт переносится' })).toBeVisible()
  await page.getByRole('button', { name: m.studio_delete({}, ru) }).click()
  const confirm = page.getByRole('alertdialog', {
    name: m.studio_update_delete_title({ title: 'Старт переносится' }, ru),
  })
  await confirm.getByRole('button', { name: m.studio_delete({}, ru) }).click()
  await expect(page.getByText(m.studio_updates_empty({}, ru))).toBeVisible()
})
