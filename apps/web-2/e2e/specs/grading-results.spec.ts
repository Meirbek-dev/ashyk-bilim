import { m } from '#/paraglide/messages'

import { expect, ru, test } from './grading-fixture'

// The results tab's counts lead into the works list (grading-fixture: two hand-ins awaiting a grade).
test.describe.configure({ timeout: 90_000 })

test('B-GRD-18 a results count opens the works it counts; a zero has no link', async ({ page, signInAs, graded }) => {
  await signInAs('teacher')
  await page.goto(`/teach/courses/${graded.courseId}/activities/${graded.activityId}/results`)
  await expect(page.getByRole('region', { name: m.grading_kpi_returned({}, ru) }).getByRole('link')).toHaveCount(0)
  const pending = page.getByRole('region', { name: m.grading_kpi_needs_grading({}, ru) })
  await expect(pending).toContainText('2')
  await pending.getByRole('link', { name: m.grading_show_works({}, ru) }).click()
  await expect(page).toHaveURL(/\/submissions\?status=needs_grading/)
})

test('B-GRD-18 a question without enough graded works says so for its discrimination', async ({
  page,
  signInAs,
  graded,
}) => {
  await signInAs('teacher')
  await page.goto(`/teach/courses/${graded.courseId}/activities/${graded.activityId}/results`)
  const questions = page.getByRole('table', { name: m.grading_items_stats({}, ru) })
  await expect(questions).toContainText(m.grading_discrimination_few({}, ru))
})
