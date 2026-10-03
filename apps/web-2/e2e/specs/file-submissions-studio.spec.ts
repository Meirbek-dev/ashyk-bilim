import type { Page } from '@playwright/test'

import { m } from '#/paraglide/messages'
import { getActivityFileSubmission } from '#/shared/api/gen/sdk.gen'
import type { FileSubmission } from '#/shared/api/gen/types.gen'
import { fromDateTimeInput } from '#/shared/i18n/format'

import type { MadeCourse } from '../fixtures/learning'
import { expect, ru, test, type Tasks } from './file-submissions-fixture'

// A file-submission task in the activity studio (slice 5.4): edit (state, instructions, rubric) and settings.

const studio = (course: MadeCourse, task: FileSubmission, tab = 'edit') =>
  `/teach/courses/${course.id}/activities/${task.activity_id}/${tab}`
const form = (page: Page, name: string) => page.getByRole('form', { name })
const save = (page: Page, name: string) =>
  form(page, name)
    .getByRole('button', { name: m.ui_save({}, ru) })
    .click()

async function stored(
  api: Parameters<typeof getActivityFileSubmission>[0]['client'],
  tasks: Tasks,
  task: FileSubmission,
) {
  const path = { activity_id: task.activity_id }
  const { data } = await getActivityFileSubmission({ client: api, path, headers: tasks.teacher, throwOnError: true })
  return data
}

test.use({ as: 'teacher' })

test('B-FSB-13 B-FSB-14 a draft task gets its instructions and is published from edit', async ({
  page,
  makeCourse,
  tasks,
}) => {
  const course = await makeCourse({ activities: 1 })
  const task = await tasks.make(course, { publish: false, instructions: '' })
  await page.goto(studio(course, task))
  const publishing = page.getByRole('region', { name: m.submission_publishing({}, ru) })
  await expect(publishing.getByText(m.submission_lifecycle_draft({}, ru), { exact: true })).toBeVisible()
  await expect(publishing.getByText(m.submission_draft_hint({}, ru))).toBeVisible()
  await publishing.getByRole('button', { name: m.submission_publish({}, ru) }).click()
  await expect(publishing.getByText(m.submission_publish_needs_instructions({}, ru))).toBeVisible()

  const instructions = form(page, m.submission_instructions({}, ru))
  await instructions.getByRole('textbox', { name: m.submission_instructions({}, ru) }).fill('Опишите опыт')
  await save(page, m.submission_instructions({}, ru))
  await expect(page.getByText(m.submission_saved({}, ru))).toBeVisible()
  await publishing.getByRole('button', { name: m.submission_publish({}, ru) }).click()
  await expect(page.getByText(m.submission_published_toast({}, ru), { exact: true })).toBeVisible()
  await expect(publishing.getByText(m.submission_lifecycle_published({}, ru), { exact: true })).toBeVisible()
  await expect(page.getByRole('switch', { name: m.studio_published_switch({}, ru) })).toBeChecked()

  await instructions.getByRole('textbox', { name: m.submission_instructions({}, ru) }).fill('')
  await save(page, m.submission_instructions({}, ru))
  await expect(instructions.getByText(m.errors_conflict({}, ru))).toBeVisible()
})

test('B-FSB-15 rubric criteria are added, checked, saved and removed', async ({ page, api, makeCourse, tasks }) => {
  const course = await makeCourse({ activities: 1 })
  const task = await tasks.make(course)
  await page.goto(studio(course, task))
  const rubric = form(page, m.submission_rubric_title({}, ru))
  await expect(rubric.getByText(m.submission_rubric_empty({}, ru))).toBeVisible()
  const add = rubric.getByRole('button', { name: m.submission_criterion_add({}, ru) })
  const name = (number: number) => rubric.getByRole('textbox', { name: m.submission_criterion_name({ number }, ru) })
  const points = rubric.getByRole('textbox', { name: m.submission_criterion_max({}, ru) })
  await add.click()
  await save(page, m.submission_rubric_title({}, ru))
  await expect(rubric.getByText(m.validation_required({}, ru))).toBeVisible()
  await name(1).fill('Структура')
  await points.nth(0).fill('10')
  await add.click()
  await name(2).fill('Стиль')
  await points.nth(1).fill('5')
  await save(page, m.submission_rubric_title({}, ru))
  await expect(page.getByText(m.submission_saved({}, ru))).toBeVisible()
  await expect
    .poll(async () => (await stored(api, tasks, task))?.rubric.criteria?.map(criterion => criterion.label))
    .toEqual(['Структура', 'Стиль'])
  await rubric.getByRole('button', { name: m.submission_criterion_remove({ number: 1 }, ru) }).click()
  await save(page, m.submission_rubric_title({}, ru))
  await expect
    .poll(async () => (await stored(api, tasks, task))?.rubric.criteria?.map(criterion => criterion.max_score))
    .toEqual([5])
})

test('B-FSB-16 file rules: count, size and types; a number out of range is refused under its field', async ({
  page,
  api,
  makeCourse,
  tasks,
}) => {
  const course = await makeCourse({ activities: 1 })
  const task = await tasks.make(course)
  await page.goto(studio(course, task, 'settings'))
  const files = form(page, m.submission_files_title({}, ru))
  const count = files.getByRole('textbox', { name: m.submission_field_max_files({}, ru) })
  await count.fill('30')
  await save(page, m.submission_files_title({}, ru))
  await expect(files.getByText(m.validation_out_of_range({}, ru))).toBeVisible()
  await count.fill('3')
  await files.getByRole('textbox', { name: m.submission_field_max_size({}, ru) }).fill('5')
  await files.getByRole('checkbox', { name: m.submission_type_pdf({}, ru) }).click()
  await files.getByRole('checkbox', { name: m.submission_type_images({}, ru) }).click()
  await save(page, m.submission_files_title({}, ru))
  await expect(page.getByText(m.submission_saved({}, ru))).toBeVisible()
  const data = await stored(api, tasks, task)
  expect(data).toMatchObject({ max_files: 3, max_file_size_mb: 5 })
  expect(data?.allowed_mime_types).toEqual(expect.arrayContaining(['application/pdf', 'image/png']))
})

test('B-FSB-17 deadline, late penalty, attempts and grade release are saved', async ({
  page,
  api,
  makeCourse,
  tasks,
}) => {
  const course = await makeCourse({ activities: 1 })
  const task = await tasks.make(course)
  await page.goto(studio(course, task, 'settings'))
  const deadlines = form(page, m.submission_deadlines_title({}, ru))
  await deadlines.getByLabel(m.submission_field_due({}, ru), { exact: true }).fill('2030-05-01T18:00')
  await deadlines.getByRole('radio', { name: m.submission_late_kind_cutoff({}, ru) }).click()
  await save(page, m.submission_deadlines_title({}, ru))
  await expect(deadlines.getByText(m.validation_invalid({}, ru))).toBeVisible()
  await deadlines.getByRole('radio', { name: m.submission_late_kind_penalty({}, ru) }).click()
  await deadlines.getByRole('textbox', { name: m.submission_field_percent({}, ru) }).fill('10')
  await deadlines.getByRole('textbox', { name: m.submission_field_max_days({}, ru) }).fill('3')
  await deadlines.getByRole('textbox', { name: m.submission_field_max_attempts({}, ru) }).fill('2')
  await deadlines.getByRole('radio', { name: m.submission_release_batch({}, ru) }).click()
  await save(page, m.submission_deadlines_title({}, ru))
  await expect(page.getByText(m.submission_saved({}, ru))).toBeVisible()
  expect(await stored(api, tasks, task)).toMatchObject({
    due_at_unix: fromDateTimeInput('2030-05-01T18:00'),
    allow_late: true,
    late_policy: { kind: 'penalty', percent_per_day: 10, max_days: 3 },
    max_attempts: 2,
    grade_release_mode: 'batch',
  })
})

for (const locale of ['kk', 'en'] as const) {
  test(`B-FSB-18 the task studio speaks ${locale}`, async ({ page, context, baseURL, makeCourse, tasks }) => {
    const course = await makeCourse({ activities: 1 })
    const task = await tasks.make(course)
    await context.addCookies([{ name: 'ab_locale', value: locale, url: String(baseURL) }])
    await page.goto(studio(course, task))
    await expect(page.locator('html')).toHaveAttribute('lang', locale)
    await expect(page.getByRole('heading', { name: m.submission_rubric_title({}, { locale }) })).toBeVisible()
    await page.goto(studio(course, task, 'settings'))
    await expect(page.getByRole('heading', { name: m.submission_deadlines_title({}, { locale }) })).toBeVisible()
  })
}
