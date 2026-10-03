import type { Locator } from '@playwright/test'

import { m } from '#/paraglide/messages'
import { courseLifecycle, getCurriculum } from '#/shared/api/gen/sdk.gen'
import type { CourseLifecycleRequest } from '#/shared/api/gen/types.gen'

import { cookieOf, expect, ru, test } from './course-studio-fixture'

// The `content` tab: chapters, activities, create, rename, delete, drag and drop (slice 4.1).

const content = (courseId: string) => `/teach/courses/${courseId}/content`

/**
 * A keyboard drag on a handle: Space picks it up (the handle reports it pressed), one arrow, Space drops it. The drop
 * has settled when focus is back on the handle: only then can the next drag start.
 */
async function dragByKeyboard(handle: Locator, arrow: 'ArrowUp' | 'ArrowDown') {
  // A pick-up during the previous drop's animation is ignored by dnd-kit: press again until it takes.
  await expect(async () => {
    await handle.press('Space')
    await expect(handle).toHaveAttribute('aria-pressed', 'true', { timeout: 1000 })
  }).toPass()
  await handle.press(arrow)
  await handle.press('Space')
  await expect(handle).toHaveAttribute('aria-pressed', 'false')
  await expect(handle).toBeFocused()
}

test.use({ as: 'teacher' })

test('B-CST-06 chapters list typed activities with status and studio links; an empty course says so', async ({
  page,
  studio,
}) => {
  const empty = await studio.course()
  await page.goto(content(empty.course.id))
  await expect(page.getByText(m.studio_content_empty({}, ru))).toBeVisible()
  const made = await studio.course({ chapters: [{ name: 'Введение', pages: [{ name: 'Первая', published: true }] }] })
  const activity = made.chapters[0]?.activities[0]
  await page.goto(content(made.course.id))
  await expect(page.getByRole('heading', { level: 2, name: 'Введение' })).toBeVisible()
  const row = page.getByRole('listitem').filter({ hasText: 'Первая' })
  await expect(row.getByText(m.activity_type_dynamic({}, ru))).toBeVisible()
  await expect(row.getByText(m.studio_activity_status_published({}, ru))).toBeVisible()
  await expect(row.getByRole('link', { name: 'Первая' })).toHaveAttribute(
    'href',
    `/teach/courses/${made.course.id}/activities/${activity?.id}/edit`,
  )
})

test('B-CST-07 a new chapter is appended last at once', async ({ page, studio }) => {
  const made = await studio.course({ chapters: [{ name: 'Первая глава' }] })
  await page.goto(content(made.course.id))
  await page.getByRole('button', { name: m.studio_chapter_new({}, ru) }).click()
  const dialog = page.getByRole('dialog', { name: m.studio_chapter_new({}, ru) })
  await dialog.getByRole('textbox', { name: m.studio_field_name({}, ru) }).fill('Вторая глава')
  await dialog.getByRole('button', { name: m.studio_create_submit({}, ru) }).click()
  await expect(page.getByText(m.studio_chapter_created({}, ru))).toBeVisible()
  await expect(page.getByRole('heading', { level: 2 })).toHaveText(['Первая глава', 'Вторая глава'])
})

test('B-CST-08 one dialog creates any type and opens its studio', async ({ page, studio, seed }) => {
  const made = await studio.course({ chapters: [{ name: 'Глава' }] })
  const kinds = [
    { type: m.activity_type_quiz({}, ru), name: 'Входной тест' },
    { type: m.activity_type_video({}, ru), name: 'Лекция', source: m.studio_video_youtube({}, ru) },
  ]
  for (const kind of kinds) {
    await page.goto(content(made.course.id))
    await page.getByRole('button', { name: m.studio_activity_new_in({ name: 'Глава' }, ru) }).click()
    const dialog = page.getByRole('dialog', { name: m.studio_activity_new({}, ru) })
    await dialog.getByRole('radio', { name: kind.type, exact: true }).check()
    if (kind.source) await dialog.getByRole('radio', { name: kind.source }).check()
    await dialog.getByRole('textbox', { name: m.studio_field_name({}, ru) }).fill(kind.name)
    await dialog.getByRole('button', { name: m.studio_create_submit({}, ru) }).click()
    await expect(page).toHaveURL(/\/activities\/[\w-]+\/edit$/)
    await expect(page.getByText(kind.name).first()).toBeVisible()
  }
  const headers = cookieOf(seed, 'teacher')
  const { data } = await getCurriculum({
    client: studio.api,
    path: { course_id: made.course.id },
    headers,
    throwOnError: true,
  })
  const created = data.chapters[0]?.activities.map(a => [a.name, a.activity_type, a.activity_sub_type])
  expect(created).toEqual([
    ['Входной тест', 'quiz', 'quiz_standard'],
    ['Лекция', 'video', 'video_youtube'],
  ])
})

test('B-CST-09 rename in place: focused labelled field, Enter saves, Escape cancels, focus returns', async ({
  page,
  studio,
}) => {
  const made = await studio.course({ chapters: [{ name: 'Старое название', pages: [{ name: 'Урок' }] }] })
  await page.goto(content(made.course.id))
  const rename = page.getByRole('button', { name: m.studio_rename_named({ name: 'Старое название' }, ru) })
  await rename.click()
  const field = page.getByRole('textbox', { name: m.studio_rename_field({ name: 'Старое название' }, ru) })
  await expect(field).toBeFocused()
  await field.press('Escape')
  await expect(field).toHaveCount(0)
  await expect(rename).toBeFocused()
  await rename.click()
  await field.fill('Новое название')
  await field.press('Enter')
  await expect(page.getByRole('heading', { level: 2, name: 'Новое название' })).toBeVisible()
  await page.getByRole('button', { name: m.studio_rename_named({ name: 'Урок' }, ru) }).click()
  const lesson = page.getByRole('textbox', { name: m.studio_rename_field({ name: 'Урок' }, ru) })
  await lesson.fill('Урок 1')
  await lesson.press('Enter')
  await expect(page.getByRole('link', { name: 'Урок 1' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('link', { name: 'Урок 1' })).toBeVisible()
})

test('B-CST-10 deleting asks with the name; the rest of the content stays', async ({ page, studio }) => {
  const made = await studio.course({
    chapters: [{ name: 'Оставить', pages: [{ name: 'A' }, { name: 'B' }] }, { name: 'Удалить главу' }],
  })
  await page.goto(content(made.course.id))
  await page.getByRole('button', { name: m.studio_delete_named({ name: 'A' }, ru) }).click()
  const confirm = page.getByRole('alertdialog', { name: m.studio_activity_delete_title({ name: 'A' }, ru) })
  await expect(confirm.getByRole('button', { name: m.ui_cancel({}, ru) })).toBeFocused()
  await confirm.getByRole('button', { name: m.studio_delete({}, ru) }).click()
  await expect(page.getByRole('link', { name: 'A', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: m.studio_delete_named({ name: 'Удалить главу' }, ru) }).click()
  const chapter = page.getByRole('alertdialog', { name: m.studio_chapter_delete_title({ name: 'Удалить главу' }, ru) })
  await expect(chapter.getByText(m.studio_chapter_delete_consequence({}, ru))).toBeVisible()
  await chapter.getByRole('button', { name: m.studio_delete({}, ru) }).click()
  await expect(page.getByRole('heading', { level: 2 })).toHaveText(['Оставить'])
  await expect(page.getByRole('link', { name: 'B', exact: true })).toBeVisible()
})

test('B-CST-11 the keyboard moves an activity and a chapter; the order survives a reload', async ({
  page,
  studio,
  seed,
}) => {
  const order = async () => {
    const headers = cookieOf(seed, 'teacher')
    const { data } = await getCurriculum({
      client: studio.api,
      path: { course_id: made.course.id },
      headers,
      throwOnError: true,
    })
    return data.chapters.map(c => [c.name, c.activities.map(a => a.name)])
  }
  const made = await studio.course({
    chapters: [{ name: 'Глава 1', pages: [{ name: 'Первый' }, { name: 'Второй' }] }, { name: 'Глава 2' }],
  })
  await page.goto(content(made.course.id))
  const links = page.getByRole('main').getByRole('listitem').getByRole('link')
  await expect(links).toHaveText(['Первый', 'Второй'])
  await dragByKeyboard(page.getByRole('button', { name: m.studio_drag_named({ name: 'Первый' }, ru) }), 'ArrowDown')
  await expect(links).toHaveText(['Второй', 'Первый'])
  // The next drag starts once the drop has settled (saved).
  await expect.poll(order).toEqual([
    ['Глава 1', ['Второй', 'Первый']],
    ['Глава 2', []],
  ])
  await dragByKeyboard(page.getByRole('button', { name: m.studio_drag_named({ name: 'Глава 2' }, ru) }), 'ArrowUp')
  await expect(page.getByRole('heading', { level: 2 })).toHaveText(['Глава 2', 'Глава 1'])
  await expect.poll(order).toEqual([
    ['Глава 2', []],
    ['Глава 1', ['Второй', 'Первый']],
  ])
  await page.reload()
  await expect(links).toHaveText(['Второй', 'Первый'])
})

test('B-CST-12 an archived course shows its content without any action', async ({ page, studio, seed }) => {
  const made = await studio.course({ chapters: [{ name: 'Архивная глава', pages: [{ name: 'Урок' }] }] })
  const body: CourseLifecycleRequest = { action: 'archive' }
  const headers = cookieOf(seed, 'teacher')
  await courseLifecycle({ client: studio.api, path: { course_id: made.course.id }, body, headers, throwOnError: true })
  await page.goto(content(made.course.id))
  await expect(page.getByRole('heading', { level: 2, name: 'Архивная глава' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Урок' })).toBeVisible()
  const main = page.getByRole('main')
  await expect(main.getByRole('button')).toHaveCount(0)
  await page.goto(`/teach/courses/${made.course.id}/settings`)
  await expect(page.getByRole('button', { name: m.studio_restore({}, ru) })).toBeVisible()
  await expect(page.getByRole('form', { name: m.studio_details_title({}, ru) })).toHaveCount(0)
})
