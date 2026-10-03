import type { Page } from '@playwright/test'

import { m } from '#/paraglide/messages'
import { myAttempts } from '#/shared/api/gen/sdk.gen'
import type { FileSubmission } from '#/shared/api/gen/types.gen'
import { formatDateTime, formatNumber, formatPercent } from '#/shared/i18n/format'

import type { MadeCourse } from '../fixtures/learning'
import { gotoLive } from '../fixtures/test'
import { expect, PDF, ru, test } from './file-submissions-fixture'

// The learner's hand-in (slice 5.4): /learn/$courseId/$activityId/submission.

const DAY = 86_400
const now = () => Math.floor(Date.now() / 1000)
const handIn = (course: MadeCourse, task: FileSubmission) => `/learn/${course.id}/${task.activity_id}/submission`
const fileField = (page: Page) => page.getByLabel(m.submission_file_field({}, ru))
const region = (page: Page, name: string) => page.getByRole('region', { name })
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
)

test('B-FSB-01 only an enrolled learner opens the hand-in; another activity type is not found', async ({
  page,
  learner,
  makeCourse,
  tasks,
}) => {
  const course = await makeCourse({ activities: 1 })
  const task = await tasks.make(course)
  await page.goto(handIn(course, task))
  await expect(page).toHaveURL(/\/login\?redirect=/)
  await learner.signIn()
  await page.goto(handIn(course, task))
  await expect(page.getByRole('heading', { name: m.platform_forbidden_title({}, ru) })).toBeVisible()
  await learner.enroll(course)
  await page.goto(`/learn/${course.id}/${course.activityIds[0]}/submission`)
  await expect(page.getByRole('heading', { level: 1, name: m.player_not_found({}, ru) })).toBeVisible()
  await page.goto(handIn(course, task))
  await expect(page.getByRole('heading', { level: 1, name: 'Эссе' })).toBeVisible()
})

test('B-FSB-02 a task the learner cannot read yet is "not set up", without an error', async ({
  page,
  learner,
  makeCourse,
  tasks,
}) => {
  const course = await makeCourse({ activities: 1 })
  const task = await tasks.make(course)
  await learner.enroll(course)
  await learner.signIn()
  await gotoLive(page, `/learn/${course.id}/${task.activity_id}`)
  // The imported tasks (a draft config behind a live activity) cannot be made through the API: the learner's 404 is
  // answered here, for the client-side navigation from the player's entry card.
  const problem = { type: 'about:blank', title: 'Not Found', status: 404, code: 'not-found' }
  await page.route(`**/api/v2/activities/${task.activity_id}/file-submission`, route =>
    route.fulfill({ status: 404, contentType: 'application/problem+json', body: JSON.stringify(problem) }),
  )
  await page.getByRole('link', { name: m.player_entry_start({}, ru) }).click()
  await expect(page.getByRole('heading', { name: m.submission_not_configured_title({}, ru) })).toBeVisible()
  await expect(page.getByText(m.submission_not_configured_text({}, ru))).toBeVisible()
  await expect(fileField(page)).toHaveCount(0)
})

test('B-FSB-03 B-FSB-04 B-FSB-05 B-FSB-06 B-FSB-11 a learner attaches files and hands them in', async ({
  page,
  context,
  api,
  learner,
  makeCourse,
  tasks,
}) => {
  const course = await makeCourse({ activities: 1 })
  const due = now() + 7 * DAY
  const task = await tasks.make(course, {
    max_files: 2,
    max_file_size_mb: 1,
    max_attempts: 2,
    allowed_mime_types: ['application/pdf', 'image/png'],
    due_at_unix: due,
    late_policy: { kind: 'penalty', percent_per_day: 10, max_days: 3 },
  })
  await learner.enroll(course)
  await learner.signIn()
  await page.goto(handIn(course, task))
  await expect(page.getByText(m.submission_due({ date: formatDateTime(due, 'ru') }, ru))).toBeVisible()
  const late = { percent: formatPercent(10, 'ru'), days: formatNumber(3, {}, 'ru') }
  await expect(page.getByText(m.submission_late_penalty(late, ru))).toBeVisible()
  await expect(page.getByText('эссе', { exact: true })).toBeVisible()
  await expect(page.getByText(m.submission_max_files({ count: 2 }, ru))).toBeVisible()
  await expect(page.getByText(m.submission_max_size({ mb: 1 }, ru))).toBeVisible()
  await expect(page.getByText(m.submission_type_images({}, ru))).toBeVisible()

  await fileField(page).setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('x') })
  await expect(page.getByText(m.ui_file_wrong_type({}, ru))).toBeVisible()
  await fileField(page).setInputFiles({ name: 'essay.pdf', mimeType: 'application/pdf', buffer: PDF })
  await expect(page.getByText(m.submission_file_attached({}, ru))).toBeVisible()
  await expect(page.getByRole('button', { name: 'essay.pdf', exact: true })).toBeVisible()
  await fileField(page).setInputFiles({ name: 'figure.png', mimeType: 'image/png', buffer: PNG })
  await expect(page.getByRole('button', { name: 'figure.png', exact: true })).toBeVisible()
  await expect(page.getByText(m.submission_files_full({}, ru))).toBeVisible()
  await expect(fileField(page)).toBeDisabled()
  await page.getByRole('button', { name: m.submission_remove_file({ name: 'figure.png' }, ru) }).click()
  await expect(page.getByText(m.submission_file_removed({}, ru))).toBeVisible()
  await expect(page.getByRole('button', { name: 'figure.png', exact: true })).toHaveCount(0)

  await page.getByRole('button', { name: m.submission_submit({}, ru) }).click()
  const dialog = page.getByRole('alertdialog', { name: m.submission_submit_title({}, ru) })
  await expect(dialog.getByText(m.submission_submit_text({ number: 1, max: 2 }, ru))).toBeVisible()
  const sent = page.waitForRequest(
    request => request.method() === 'POST' && request.url().endsWith(`/file-submissions/${task.id}/submit`),
  )
  await dialog.getByRole('button', { name: m.submission_submit({}, ru) }).click()
  const headers = (await sent).headers()
  expect(headers['idempotency-key']).toMatch(/^[\da-f-]{36}$/)
  expect(headers['if-match']).toMatch(/^\d+$/)
  await expect(page.getByText(m.submission_submitted({}, ru), { exact: true })).toBeVisible()
  const work = region(page, m.submission_your_work({}, ru))
  await expect(work.getByText(m.submission_awaiting_review({}, ru))).toBeVisible()
  await expect(work.getByRole('button', { name: 'essay.pdf', exact: true })).toBeVisible()
  await expect(work.getByRole('button', { name: m.submission_remove_file({ name: 'essay.pdf' }, ru) })).toHaveCount(0)
  const history = region(page, m.submission_history({}, ru))
  await expect(history.getByText(m.submission_attempt({ number: 1 }, ru))).toBeVisible()
  await expect(history.getByText(m.submission_status_submitted({}, ru))).toBeVisible()

  const learnerHeaders = await tasks.headersOf(context)
  const path = { file_submission_id: task.id }
  const { data } = await myAttempts({ client: api, path, headers: learnerHeaders, throwOnError: true })
  expect(data).toHaveLength(1)
  expect(data[0]).toMatchObject({ status: 'submitted', files: [{ filename: 'essay.pdf' }] })
})

test('B-FSB-07 B-FSB-10 B-FSB-11 a released grade with feedback and criteria; own files download; a new attempt', async ({
  page,
  context,
  learner,
  makeCourse,
  tasks,
}) => {
  const course = await makeCourse({ activities: 1 })
  const rubric = { criteria: [{ criterion_id: 'c1', label: 'Структура', max_score: 10 }] }
  const task = await tasks.make(course, { max_attempts: 2, rubric })
  await learner.enroll(course)
  await learner.signIn()
  const headers = await tasks.headersOf(context)
  const attempt = await tasks.handIn(task, headers, [await tasks.upload(headers)])
  const scores = { criteria: [{ criterion_id: 'c1', label: 'Структура', score: 8, max_score: 10 }] }
  await tasks.grade(attempt, { action: 'publish', final_score: 85, feedback: 'Хорошая работа', rubric_scores: scores })
  await page.goto(handIn(course, task))
  const result = region(page, m.submission_result_title({}, ru))
  await expect(result.getByText(m.submission_score({ score: formatPercent(85, 'ru') }, ru))).toBeVisible()
  await expect(result.getByText('Хорошая работа')).toBeVisible()
  await expect(result.getByText(m.submission_criterion_score({ score: '8', max: '10' }, ru))).toBeVisible()

  const signed = page.waitForResponse(response => response.url().includes('/file-submission-files/') && response.ok())
  const popup = page.waitForEvent('popup')
  await result.getByRole('button', { name: 'essay-1.pdf', exact: true }).click()
  await signed
  await (await popup).close()

  await result.getByRole('button', { name: m.submission_new_attempt({}, ru) }).click()
  await expect(page.getByText(m.submission_attempt_started({}, ru))).toBeVisible()
  await expect(fileField(page)).toBeEnabled()
  const history = region(page, m.submission_history({}, ru))
  await expect(history.getByRole('listitem')).toHaveCount(2)
  await expect(history.getByText(m.submission_not_submitted({}, ru))).toBeVisible()
})

test('B-FSB-07 no new attempt once the cap is spent', async ({ page, context, learner, makeCourse, tasks }) => {
  const course = await makeCourse({ activities: 1 })
  const task = await tasks.make(course, { max_attempts: 1 })
  await learner.enroll(course)
  await learner.signIn()
  const headers = await tasks.headersOf(context)
  const attempt = await tasks.handIn(task, headers, [await tasks.upload(headers)])
  await tasks.grade(attempt, { action: 'publish', final_score: 50 })
  await page.goto(handIn(course, task))
  await expect(page.getByText(m.submission_score({ score: formatPercent(50, 'ru') }, ru))).toBeVisible()
  await expect(page.getByRole('button', { name: m.submission_new_attempt({}, ru) })).toHaveCount(0)
})

test('B-FSB-03 B-FSB-07 late work: the deadline label and the score before the penalty', async ({
  page,
  context,
  learner,
  makeCourse,
  tasks,
}) => {
  const course = await makeCourse({ activities: 1 })
  const late_policy = { kind: 'penalty' as const, percent_per_day: 10, max_days: 3 }
  const task = await tasks.make(course, { due_at_unix: now() - 3600, late_policy })
  await learner.enroll(course)
  await learner.signIn()
  const headers = await tasks.headersOf(context)
  const attempt = await tasks.handIn(task, headers, [await tasks.upload(headers)])
  expect(attempt).toMatchObject({ is_late: true, late_penalty_pct: 10 })
  await tasks.grade(attempt, { action: 'publish', final_score: 80 })
  await page.goto(handIn(course, task))
  await expect(page.getByText(m.submission_past_due({}, ru))).toBeVisible()
  const penalty = { raw: formatPercent(80, 'ru'), percent: formatPercent(10, 'ru') }
  await expect(page.getByText(m.submission_penalty(penalty, ru))).toBeVisible()
  await expect(page.getByText(m.submission_score({ score: formatPercent(72, 'ru') }, ru))).toBeVisible()
})

test('B-FSB-08 returned work is revised and handed in again', async ({ page, context, learner, makeCourse, tasks }) => {
  const course = await makeCourse({ activities: 1 })
  const task = await tasks.make(course)
  await learner.enroll(course)
  await learner.signIn()
  const headers = await tasks.headersOf(context)
  const attempt = await tasks.handIn(task, headers, [await tasks.upload(headers)])
  await tasks.grade(attempt, { action: 'return', feedback: 'Добавьте выводы' })
  await page.goto(handIn(course, task))
  await expect(page.getByText(m.submission_returned({}, ru))).toBeVisible()
  await expect(page.getByText('Добавьте выводы')).toBeVisible()
  await expect(page.getByRole('button', { name: m.submission_remove_file({ name: 'essay-1.pdf' }, ru) })).toBeVisible()
  await page.getByRole('button', { name: m.submission_submit({}, ru) }).click()
  const dialog = page.getByRole('alertdialog', { name: m.submission_submit_title({}, ru) })
  await expect(dialog.getByText(m.submission_submit_text_unlimited({ number: 1 }, ru))).toBeVisible()
  await dialog.getByRole('button', { name: m.submission_submit({}, ru) }).click()
  await expect(page.getByText(m.submission_awaiting_review({}, ru))).toBeVisible()
})

test('B-FSB-03 B-FSB-09 a closed deadline replaces the upload with the reason', async ({
  page,
  learner,
  makeCourse,
  tasks,
}) => {
  const course = await makeCourse({ activities: 1 })
  const task = await tasks.make(course, { due_at_unix: now() - DAY, allow_late: false })
  await learner.enroll(course)
  await learner.signIn()
  await page.goto(handIn(course, task))
  await expect(page.getByText(m.submission_late_closed({}, ru))).toBeVisible()
  await expect(page.getByText(m.submission_reason_past_due({}, ru))).toBeVisible()
  await expect(fileField(page)).toHaveCount(0)
  await expect(page.getByRole('button', { name: m.submission_submit({}, ru) })).toHaveCount(0)
})

test('B-FSB-12 a change over a draft changed elsewhere asks, then applies to the fresh draft', async ({
  page,
  context,
  learner,
  makeCourse,
  tasks,
}) => {
  const course = await makeCourse({ activities: 1 })
  const task = await tasks.make(course, { max_files: 3 })
  await learner.enroll(course)
  await learner.signIn()
  const headers = await tasks.headersOf(context)
  const first = await tasks.upload(headers)
  await tasks.attach(task, headers, [first])
  await page.goto(handIn(course, task))
  await expect(page.getByRole('button', { name: 'essay-1.pdf', exact: true })).toBeVisible()
  // Another tab attaches a second file: the page still holds the older version of the draft.
  await tasks.attach(task, headers, [first, await tasks.upload(headers)])
  await page.getByRole('button', { name: m.submission_remove_file({ name: 'essay-1.pdf' }, ru) }).click()
  const conflict = page.getByRole('alertdialog', { name: m.ui_conflict_title({}, ru) })
  await conflict.getByRole('button', { name: m.ui_conflict_retry({}, ru) }).click()
  await expect(page.getByText(m.submission_file_removed({}, ru))).toBeVisible()
  await expect(page.getByRole('button', { name: 'essay-2.pdf', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'essay-1.pdf', exact: true })).toHaveCount(0)
})

for (const locale of ['kk', 'en'] as const) {
  test(`B-FSB-18 the hand-in speaks ${locale}`, async ({ page, context, baseURL, learner, makeCourse, tasks }) => {
    const course = await makeCourse({ activities: 1 })
    const task = await tasks.make(course)
    await learner.enroll(course)
    await learner.signIn()
    await context.addCookies([{ name: 'ab_locale', value: locale, url: String(baseURL) }])
    await page.goto(handIn(course, task))
    await expect(page.locator('html')).toHaveAttribute('lang', locale)
    await expect(page.getByRole('heading', { name: m.submission_instructions({}, { locale }) })).toBeVisible()
    await expect(page.getByRole('button', { name: m.submission_submit({}, { locale }) })).toBeDisabled()
  })
}
