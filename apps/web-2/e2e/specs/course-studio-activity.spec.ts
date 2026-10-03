import { m } from '#/paraglide/messages'
import { createActivity, createAssessment, getActivity, updateActivity } from '#/shared/api/gen/sdk.gen'

import { cookieOf, expect, ru, test } from './course-studio-fixture'

// The activity studio (slice 4.1): header switch, page autosave and conflicts, media sources, settings.

const studioUrl = (courseId: string, activityId: string, tab = 'edit') =>
  `/teach/courses/${courseId}/activities/${activityId}/${tab}`

test.beforeEach(async ({ signInAs }) => signInAs('teacher'))

test('B-CST-26 the header switch publishes at once and asks before unpublishing; a refusal is shown', async ({
  page,
  studio,
  seed,
}) => {
  const made = await studio.course({ chapters: [{ pages: [{ name: 'Лекция' }] }] })
  const activity = made.chapters[0]?.activities[0]
  await page.goto(studioUrl(made.course.id, activity?.id ?? ''))
  await expect(page.getByRole('link', { name: m.platform_back({}, ru) })).toHaveAttribute(
    'href',
    `/teach/courses/${made.course.id}/content`,
  )
  const published = page.getByRole('switch', { name: m.studio_published_switch({}, ru) })
  await expect(published).not.toBeChecked()
  await published.click()
  await expect(page.getByText(m.studio_activity_published({}, ru))).toBeVisible()
  await expect(published).toBeChecked()
  await published.click()
  const confirm = page.getByRole('alertdialog', { name: m.studio_activity_unpublish_title({ name: 'Лекция' }, ru) })
  await confirm.getByRole('button', { name: m.studio_unpublish({}, ru) }).click()
  await expect(page.getByText(m.studio_activity_unpublished({}, ru))).toBeVisible()
  await expect(published).not.toBeChecked()
  const headers = cookieOf(seed, 'teacher')
  const body = { chapter_id: made.chapters[0]?.chapter.id ?? '', kind: 'quiz' as const, title: 'Тест' }
  const quiz = await createAssessment({ client: studio.api, body, headers, throwOnError: true })
  await page.goto(studioUrl(made.course.id, quiz.data.activity_id))
  await page.getByRole('switch', { name: m.studio_published_switch({}, ru) }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByRole('switch', { name: m.studio_published_switch({}, ru) })).not.toBeChecked()
})

test('B-CST-27 a page autosaves with its status, and the status is per activity', async ({ page, studio, seed }) => {
  const made = await studio.course({ chapters: [{ pages: [{ name: 'Первая' }, { name: 'Вторая' }] }] })
  const [first, second] = made.chapters[0]?.activities ?? []
  await page.goto(studioUrl(made.course.id, first?.id ?? ''))
  const editor = page.getByRole('textbox', { name: m.editor_label({}, ru) })
  await editor.click()
  await page.keyboard.type('Текст урока')
  await expect(page.getByText(m.studio_save_saved({}, ru), { exact: true })).toBeVisible({ timeout: 10_000 })
  const headers = cookieOf(seed, 'teacher')
  const { data } = await getActivity({ client: studio.api, path: { id: first?.id ?? '' }, headers, throwOnError: true })
  expect(JSON.stringify(data.content)).toContain('Текст урока')
  expect(data.version).toBeGreaterThan(first?.version ?? 0)
  await page.getByRole('link', { name: m.platform_back({}, ru) }).click()
  await page.getByRole('link', { name: 'Вторая' }).click()
  await expect(page).toHaveURL(new RegExp(`${second?.id}/edit$`))
  await expect(page.getByRole('textbox', { name: m.editor_label({}, ru) })).toBeVisible()
  await expect(page.getByText(m.studio_save_saved({}, ru), { exact: true })).toHaveCount(0)
})

test('B-CST-28 a save over someone else’s opens the conflict dialog and keeps the text', async ({
  page,
  studio,
  seed,
}) => {
  const made = await studio.course({ chapters: [{ pages: [{ name: 'Общая' }] }] })
  const activity = made.chapters[0]?.activities[0]
  await page.goto(studioUrl(made.course.id, activity?.id ?? ''))
  const editor = page.getByRole('textbox', { name: m.editor_label({}, ru) })
  await expect(editor).toBeVisible()
  const headers = { ...cookieOf(seed, 'teacher'), 'If-Match': activity?.version ?? 0 }
  const content = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Чужая правка' }] }] }
  const path = { id: activity?.id ?? '' }
  await updateActivity({ client: studio.api, path, body: { content }, headers, throwOnError: true })
  await editor.click()
  await page.keyboard.type('Моя правка')
  const dialog = page.getByRole('alertdialog', { name: m.ui_conflict_title({}, ru) })
  await expect(dialog).toBeVisible({ timeout: 10_000 })
  await dialog.getByRole('button', { name: m.ui_conflict_retry({}, ru) }).click()
  await expect(page.getByText(m.studio_save_saved({}, ru), { exact: true })).toBeVisible({ timeout: 10_000 })
  const { data } = await getActivity({
    client: studio.api,
    path,
    headers: cookieOf(seed, 'teacher'),
    throwOnError: true,
  })
  expect(JSON.stringify(data.content)).toContain('Моя правка')
})

test('B-CST-29 a YouTube video takes only a YouTube link; a file video offers an upload', async ({
  page,
  studio,
  seed,
}) => {
  const made = await studio.course({ chapters: [{}] })
  const headers = cookieOf(seed, 'teacher')
  const chapter = { id: made.chapters[0]?.chapter.id ?? '' }
  const kinds = { activity_type: 'video', activity_sub_type: 'video_youtube' }
  const youtube = await createActivity({
    client: studio.api,
    path: chapter,
    body: { name: 'Видео', ...kinds },
    headers,
    throwOnError: true,
  })
  await page.goto(studioUrl(made.course.id, youtube.data.id))
  const section = page.getByRole('form', { name: m.studio_media_title({}, ru) })
  const link = section.getByRole('textbox', { name: m.studio_youtube_field({}, ru) })
  await link.fill('https://vimeo.com/1')
  await section.getByRole('button', { name: m.ui_save({}, ru) }).click()
  await expect(section.getByText(m.validation_format({}, ru))).toBeVisible()
  await link.fill('https://youtu.be/dQw4w9WgXcQ')
  await section.getByRole('button', { name: m.ui_save({}, ru) }).click()
  await expect(page.getByText(m.studio_saved({}, ru))).toBeVisible()
  const saved = await getActivity({ client: studio.api, path: { id: youtube.data.id }, headers, throwOnError: true })
  expect(saved.data.content).toMatchObject({ uri: 'https://youtu.be/dQw4w9WgXcQ' })
  const body = { name: 'Файл', activity_type: 'video', activity_sub_type: 'video_hosted' }
  const hosted = await createActivity({ client: studio.api, path: chapter, body, headers, throwOnError: true })
  await page.goto(studioUrl(made.course.id, hosted.data.id))
  await expect(page.getByText(m.studio_media_none({}, ru))).toBeVisible()
  await expect(page.getByText(m.studio_video_file_field({}, ru))).toBeVisible()
  await expect(page.getByText(m.studio_video_types({}, ru))).toBeVisible()
})

test('B-CST-30 the activity settings rename it with its own Save', async ({ page, studio }) => {
  const made = await studio.course({ chapters: [{ pages: [{ name: 'Старое' }] }] })
  const activity = made.chapters[0]?.activities[0]
  await page.goto(studioUrl(made.course.id, activity?.id ?? '', 'settings'))
  const form = page.getByRole('form', { name: m.platform_tab_settings({}, ru) })
  await form.getByRole('textbox', { name: m.studio_field_name({}, ru) }).fill('Новое')
  await form.getByRole('button', { name: m.ui_save({}, ru) }).click()
  await expect(page.getByText(m.studio_saved({}, ru))).toBeVisible()
  await expect(page.getByRole('banner').getByText('Новое')).toBeVisible()
})
