import { m } from '#/paraglide/messages'
import { toDateTimeInput } from '#/shared/i18n/format'

import { expectReread } from '../fixtures/test'
import { expect, queue, review, row, ru, test, toast } from './grading-fixture'

// Slice 6.1: the queue, one review, the results and the gradebook. Each test gets its own course (grading-fixture).
// The fixture registers and signs in two learners and hands in their work: more than the default 30 s on a busy stand.
test.describe.configure({ timeout: 90_000 })

test('B-GRD-01 B-GRD-02 B-GRD-03 B-GRD-05 B-GRD-06 the queue lists the hand-ins with server counts; filters and sort live in the URL', async ({
  page,
  signInAs,
  graded,
}) => {
  await signInAs('teacher')
  await page.goto(queue(graded))
  await expect(page.getByRole('heading', { level: 1, name: m.platform_tab_submissions({}, ru) })).toBeVisible()
  await expect(page.getByText(m.grading_queue_count({ count: 2 }, ru))).toBeVisible()
  await expect(row(page, graded.ana.name)).toContainText(m.grading_status_pending({}, ru))
  await expect(row(page, graded.boris.name)).toContainText(m.grading_no_score({}, ru))
  const statuses = page.getByRole('navigation', { name: m.grading_status_label({}, ru) })
  await expect(statuses.getByRole('link', { name: m.grading_filter_needs_grading({}, ru) })).toContainText('2')
  await expect(page.getByRole('link', { name: m.grading_export_csv({}, ru) })).toHaveAttribute(
    'href',
    `/api/v2/assessments/${graded.assessmentId}/submissions/export?lang=ru`,
  )

  const search = page.getByLabel(m.grading_search_label({}, ru))
  await search.fill(graded.ana.name)
  await search.press('Enter')
  await expect(page).toHaveURL(new RegExp(`q=${graded.ana.name}`))
  await expect(row(page, graded.boris.name)).toHaveCount(0)
  await expect(row(page, graded.ana.name)).toBeVisible()

  await statuses.getByRole('link', { name: new RegExp(`^${m.grading_filter_published({}, ru)}`) }).click()
  await expect(page).toHaveURL(/status=published/)
  await expect(page.getByText(m.ui_no_matches({}, ru))).toBeVisible()
  await page.getByRole('button', { name: m.ui_reset_filters({}, ru) }).click()
  await expect(page).toHaveURL(/\/submissions$/)

  await page.getByRole('button', { name: m.grading_col_score({}, ru) }).click()
  await expect(page).toHaveURL(/sort=final_score&order=asc/)
  await expect(row(page, graded.ana.name)).toBeVisible()
})

test('B-GRD-10 B-GRD-11 B-GRD-12 B-GRD-13 B-GRD-14 a review shows answers, key and verdict, scores on the item scale, then publishes', async ({
  page,
  signInAs,
  graded,
}) => {
  await signInAs('teacher')
  await page.goto(queue(graded))
  await row(page, graded.ana.name)
    .getByRole('link', { name: m.grading_action_grade({}, ru) })
    .click()
  await expect(page).toHaveURL(new RegExp(`/submissions/${graded.ana.submissionId}$`))
  // Newest first: Boris handed in after Ana, so he is the previous one.
  await expect(page.getByRole('link', { name: m.grading_prev({}, ru) })).toHaveAttribute(
    'href',
    review(graded, graded.boris.submissionId),
  )
  const capital = page.getByRole('listitem').filter({ hasText: 'Столица Казахстана?' })
  await expect(capital.getByRole('listitem').filter({ hasText: 'Астана' })).toContainText(m.grading_chosen({}, ru))
  await expect(capital.getByRole('listitem').filter({ hasText: 'Астана' })).toContainText(m.grading_right({}, ru))
  await expect(capital).toContainText(m.grading_verdict_correct({}, ru))
  await expect(page.getByText('Ответ ana')).toBeVisible()

  const points = page.getByLabel(m.grading_item_score({ max: 10 }, ru))
  await points.fill('11')
  await page.getByRole('button', { name: m.grading_publish({}, ru) }).click()
  await expect(page.getByText(m.grading_score_invalid({}, ru))).toBeVisible()
  await points.fill('7,5')
  await expect(page.getByText(/77,27/)).toBeVisible()
  await page.getByLabel(m.grading_feedback({}, ru)).fill('Хорошая работа')
  await page.getByRole('button', { name: m.grading_publish({}, ru) }).click()
  await expect(toast(page, m.grading_published({}, ru))).toBeVisible()
  await expect(page.getByRole('main')).toContainText(m.grading_status_published({}, ru))
})

test('B-GRD-15 a grade saved meanwhile by a colleague opens the conflict dialog; retry keeps the input', async ({
  page,
  signInAs,
  graded,
}) => {
  await signInAs('teacher')
  await page.goto(review(graded, graded.boris.submissionId))
  const points = page.getByLabel(m.grading_item_score({ max: 10 }, ru))
  await points.fill('3')
  // The colleague's save reaches the open page as an event: the review is read again (B-NOT-14), by design.
  expectReread(page, `/api/v2/submissions/${graded.boris.submissionId}/review`)
  await graded.grade(graded.boris.submissionId, { action: 'save', feedback: 'Коллега' })
  await page.getByRole('button', { name: m.grading_save({}, ru) }).click()
  const dialog = page.getByRole('alertdialog')
  await expect(dialog).toContainText(m.ui_conflict_title({}, ru))
  await dialog.getByRole('button', { name: m.ui_conflict_retry({}, ru) }).click()
  await expect(toast(page, m.grading_saved({}, ru))).toBeVisible()
  await expect(points).toHaveValue('3')
})

test('B-GRD-17 the folded history lists each grading entry', async ({ page, signInAs, graded }) => {
  await graded.grade(graded.ana.submissionId, { action: 'save', final_score: 50, feedback: 'Черновой отзыв' })
  await signInAs('teacher')
  await page.goto(review(graded, graded.ana.submissionId))
  await page.getByText(m.grading_history({}, ru)).click()
  const history = page.getByRole('group').filter({ hasText: m.grading_history({}, ru) })
  await expect(history).toContainText('Черновой отзыв')
  await expect(history).toContainText(m.grading_history_draft({}, ru))
})

test('B-GRD-07 publish-all asks with the count of held grades and reports what was published', async ({
  page,
  signInAs,
  graded,
}) => {
  for (const learner of [graded.ana, graded.boris])
    await graded.grade(learner.submissionId, { action: 'save', final_score: 80 })
  await signInAs('teacher')
  await page.goto(queue(graded))
  await page.getByRole('button', { name: m.grading_publish_all({}, ru) }).click()
  const dialog = page.getByRole('alertdialog')
  await expect(dialog).toContainText(m.grading_publish_all_text({ count: '2' }, ru))
  await dialog.getByRole('button', { name: m.grading_publish({}, ru) }).click()
  await expect(toast(page, m.grading_publish_all_done({ published: '2', pending: '0' }, ru))).toBeVisible()
  await expect(row(page, graded.ana.name)).toContainText(m.grading_status_published({}, ru))
})

test('B-GRD-08 the selected hand-ins go back for revision', async ({ page, signInAs, graded }) => {
  await signInAs('teacher')
  await page.goto(queue(graded))
  await row(page, graded.ana.name).getByRole('checkbox').click()
  await expect(page.getByText(m.grading_selected({ count: '1' }, ru))).toBeVisible()
  await page.getByRole('button', { name: m.grading_return_selected({}, ru) }).click()
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: m.grading_return({}, ru) })
    .click()
  await expect(toast(page, m.grading_return_done({ count: '1' }, ru))).toBeVisible()
  await expect(row(page, graded.ana.name)).toContainText(m.grading_status_returned({}, ru))
  await expect(row(page, graded.boris.name)).toContainText(m.grading_status_pending({}, ru))
})

test('B-GRD-09 B-GRD-27 a deadline extension takes a future date (a past one is an error under the field); the toast waits for the worker', async ({
  page,
  signInAs,
  graded,
}) => {
  await signInAs('teacher')
  await page.goto(queue(graded))
  await row(page, graded.ana.name).getByRole('checkbox').click()
  await page.getByRole('button', { name: m.grading_extend({}, ru) }).click()
  const dialog = page.getByRole('dialog')
  const due = dialog.getByLabel(m.grading_extend_due({}, ru))
  await due.fill('2020-01-01T10:00')
  await dialog.getByRole('button', { name: m.grading_extend({}, ru) }).click()
  await expect(due).toHaveAttribute('aria-invalid', 'true')
  await due.fill(toDateTimeInput(Math.floor(Date.now() / 1000) + 7 * 86_400))
  await dialog.getByLabel(m.grading_extend_reason({}, ru)).fill('Болезнь')
  await dialog.getByRole('button', { name: m.grading_extend({}, ru) }).click()
  await expect(toast(page, m.grading_extend_done({ count: '1' }, ru))).toBeVisible()
})

test('B-GRD-24 the group filter narrows the queue and the gradebook (URL)', async ({ page, signInAs, graded }) => {
  const group = await graded.groupOf(graded.ana)
  await signInAs('teacher')
  await page.goto(queue(graded))
  await page.getByLabel(m.grading_group({}, ru)).selectOption({ label: group })
  await expect(page).toHaveURL(/group=/)
  await expect(row(page, graded.boris.name)).toHaveCount(0)
  await expect(row(page, graded.ana.name)).toBeVisible()
  await page.goto(`/teach/courses/${graded.courseId}/gradebook`)
  const cells = page.getByRole('table', { name: m.grading_gradebook_table({}, ru) }).getByRole('link')
  await expect(cells).toHaveCount(2)
  await page.getByLabel(m.grading_group({}, ru)).selectOption({ label: group })
  await expect(cells).toHaveCount(1)
  await expect(cells).toHaveAttribute('href', review(graded, graded.ana.submissionId))
})

test('B-GRD-25 the file queue: server counts, publish-all, extension', async ({ page, signInAs, fileTask }) => {
  await fileTask.grade({ action: 'save', final_score: 70, feedback: 'Черновик' })
  await signInAs('teacher')
  await page.goto(queue(fileTask))
  await expect(page.getByText(m.grading_queue_count({ count: 1 }, ru))).toBeVisible()
  await expect(page.getByRole('link', { name: m.grading_filter_graded({}, ru) })).toContainText('1')
  await page.getByRole('button', { name: m.grading_publish_all({}, ru) }).click()
  const confirm = page.getByRole('alertdialog')
  await expect(confirm).toContainText(m.grading_publish_all_text({ count: '1' }, ru))
  await confirm.getByRole('button', { name: m.grading_publish({}, ru) }).click()
  await expect(toast(page, m.grading_publish_files_done({ published: '1', skipped: '0' }, ru))).toBeVisible()
  await expect(row(page, fileTask.name)).toContainText(m.grading_status_published({}, ru))
  // A second write reads the queue again: a new navigation, so the page-health check counts it apart.
  await page.reload()
  await row(page, fileTask.name).getByRole('checkbox').click()
  await page.getByRole('button', { name: m.grading_extend({}, ru) }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel(m.grading_extend_due({}, ru)).fill(toDateTimeInput(Math.floor(Date.now() / 1000) + 86_400))
  await dialog.getByRole('button', { name: m.grading_extend({}, ru) }).click()
  await expect(toast(page, m.grading_extend_done({ count: '1' }, ru))).toBeVisible()
})

test('B-GRD-16 B-GRD-26 a file attempt: download by a signed link, rubric points, grade and feedback publish; the history lists it', async ({
  page,
  signInAs,
  fileTask,
}) => {
  await signInAs('teacher')
  await page.goto(`${queue(fileTask)}/${fileTask.attemptId}`)
  await expect(page.getByRole('button', { name: m.grading_download({ name: 'essay-1.pdf' }, ru) })).toBeVisible()
  await page.getByLabel(m.grading_criterion_score({ label: 'Ясность', max: 10 }, ru)).fill('8')
  await expect(page.getByText(/80 %/).first()).toBeVisible()
  await page.getByLabel(m.grading_final_score({}, ru)).fill('80')
  await page.getByLabel(m.grading_feedback({}, ru)).fill('Ясно и по делу')
  await page.getByRole('button', { name: m.grading_publish({}, ru) }).click()
  await expect(toast(page, m.grading_published({}, ru))).toBeVisible()
  await expect(page.getByRole('main')).toContainText(m.grading_status_published({}, ru))
  await page.getByText(m.grading_history({}, ru)).click()
  const history = page.getByRole('group').filter({ hasText: m.grading_history({}, ru) })
  await expect(history).toContainText('Ясно и по делу')
  await expect(history).toContainText(m.grading_status_published({}, ru))
})

test('B-GRD-18 results summarize the assessment from the server; a file task says it has no summary', async ({
  page,
  signInAs,
  graded,
  fileTask,
}) => {
  await signInAs('teacher')
  await page.goto(`/teach/courses/${graded.courseId}/activities/${graded.activityId}/results`)
  await expect(page.getByRole('region', { name: m.grading_kpi_total({}, ru) })).toContainText('2')
  await expect(page.getByRole('region', { name: m.grading_kpi_needs_grading({}, ru) })).toContainText('2')
  await expect(page.getByText(m.grading_distribution({}, ru)).first()).toBeVisible()
  await expect(page.getByRole('row').filter({ hasText: 'Столица' })).toBeVisible()
  await page.goto(`/teach/courses/${fileTask.courseId}/activities/${fileTask.activityId}/results`)
  await expect(page.getByText(m.grading_results_none({}, ru))).toBeVisible()
})

test('B-GRD-19 B-GRD-20 the gradebook leads each cell into its review; search and "to review" live in the URL', async ({
  page,
  signInAs,
  graded,
}) => {
  await signInAs('teacher')
  const gradebook = `/teach/courses/${graded.courseId}/gradebook`
  await page.goto(gradebook)
  const table = page.getByRole('table', { name: m.grading_gradebook_table({}, ru) })
  await expect(table.getByRole('columnheader', { name: graded.quiz })).toBeVisible()
  const cells = table.getByRole('link')
  await expect(cells).toHaveCount(2)
  const hrefs = await cells.evaluateAll(links => links.map(link => link.getAttribute('href')))
  expect(new Set(hrefs)).toEqual(
    new Set([review(graded, graded.ana.submissionId), review(graded, graded.boris.submissionId)]),
  )
  await expect(page.getByRole('link', { name: m.grading_export_csv({}, ru) })).toHaveAttribute(
    'href',
    `/api/v2/courses/${graded.courseId}/gradebook/export?lang=ru`,
  )
  const search = page.getByLabel(m.grading_search_label({}, ru))
  await search.fill(graded.ana.name)
  await search.press('Enter')
  await expect(page).toHaveURL(new RegExp(`q=${graded.ana.name}`))
  await expect(cells).toHaveCount(1)
  await expect(cells).toHaveAttribute('href', review(graded, graded.ana.submissionId))
  await page.getByRole('link', { name: m.grading_pending_only({}, ru) }).click()
  await expect(page).toHaveURL(/pending=true/)
  await expect(cells).toHaveCount(1)
})

test('B-GRD-21 on a phone the gradebook is a card per learner', async ({ page, signInAs, graded }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await signInAs('teacher')
  await page.goto(`/teach/courses/${graded.courseId}/gradebook`)
  await expect(page.getByRole('table')).toBeHidden()
  await expect(page.getByRole('link', { name: new RegExp(graded.quiz) })).toHaveCount(2)
})

for (const locale of ['kk', 'en'] as const) {
  test(`B-GRD-23 the grading screens speak ${locale}`, async ({ page, context, baseURL, signInAs, graded }) => {
    await signInAs('teacher')
    await context.addCookies([{ name: 'ab_locale', value: locale, url: String(baseURL) }])
    const pages = [
      { url: queue(graded), text: m.grading_queue_table({}, { locale }) },
      { url: review(graded, graded.ana.submissionId), text: m.grading_answers({}, { locale }) },
      {
        url: `/teach/courses/${graded.courseId}/activities/${graded.activityId}/results`,
        text: m.grading_kpi_total({}, { locale }),
      },
      { url: `/teach/courses/${graded.courseId}/gradebook`, text: m.grading_gradebook_table({}, { locale }) },
    ]
    for (const { url, text } of pages) {
      await page.goto(url)
      await expect(page.locator('html')).toHaveAttribute('lang', locale)
      await expect(page.getByText(text).first()).toBeAttached()
      await expect(page.locator('body')).not.toContainText(/\b(grading|platform|ui)_[a-z_]+/)
    }
  })
}
