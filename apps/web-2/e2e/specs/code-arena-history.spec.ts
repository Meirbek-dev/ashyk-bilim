import { expectFailure as allowFailure } from '../fixtures/test'
import { randomUUID } from 'node:crypto'

import { m } from '#/paraglide/messages'
import { formatPercent } from '#/shared/i18n/format'

import {
  expect,
  gradedAttempt,
  openFromPlayer,
  region,
  routeLanguages,
  ru,
  start,
  test,
  typeCode,
} from './code-arena-fixture'

// The learner's code challenge (slice 5.3): a hand-in and the attempt history under it. A started attempt waits for
// the draft's save pause (5 s) and a cold `vp dev` compiles the editor: each test gets a minute.
test.describe.configure({ timeout: 60_000 })

test('B-COD-10 B-COD-11 a learner hands in the code and reads it back in the history', async ({
  page,
  learner,
  makeCourse,
  challenges,
}) => {
  const course = await makeCourse({ activities: 1 })
  const made = await challenges.make(course)
  await learner.enroll(course)
  await learner.signIn()
  await routeLanguages(page)
  await openFromPlayer(page, course, made)
  await start(page)
  await typeCode(page, 'print(3)')
  await page.getByRole('button', { name: m.code_submit({}, ru) }).click()
  const dialog = page.getByRole('alertdialog')
  await expect(dialog.getByText(m.code_submit_text_unlimited({ number: 1 }, ru))).toBeVisible()
  await dialog.getByRole('button', { name: m.code_submit({}, ru) }).click()
  await expect(page.getByText(m.code_submitted({}, ru), { exact: true })).toBeVisible()
  await expect(page).toHaveURL(/[?&]submission=/)

  const history = region(page, m.code_history({}, ru))
  await expect(history.getByText(m.code_attempt({ number: 1 }, ru), { exact: true })).toBeVisible()
  // Without a configured judge the hand-in goes to manual review; with one it is graded at once.
  const statuses = [m.code_attempt_pending({}, ru), m.code_attempt_published({}, ru), m.code_attempt_graded({}, ru)]
  await expect(history.getByText(new RegExp(`^(${statuses.join('|')})$`))).toBeVisible()
  const code = history.getByRole('textbox', { name: m.code_attempt_code({ number: 1 }, ru) })
  await expect(code).toContainText('print(3)')
  await expect(code).toHaveAttribute('contenteditable', 'false')

  const entry = region(page, m.code_solution({}, ru))
  await expect(entry.getByText(m.code_attempts_unlimited({ used: 1 }, ru))).toBeVisible()
  await expect(entry.getByRole('button', { name: m.code_start_again({}, ru) })).toBeVisible()
})

test('B-COD-10 B-COD-11 a released attempt shows its score and the test cases it passed', async ({
  page,
  learner,
  makeCourse,
  challenges,
}) => {
  const course = await makeCourse({ activities: 1 })
  const made = await challenges.make(course)
  await learner.enroll(course)
  await learner.signIn()
  await routeLanguages(page)
  const graded = gradedAttempt(made, randomUUID())
  await page.route(`**/api/v2/assessments/${made.assessment.id}/submissions/me`, route =>
    route.fulfill({ json: [graded] }),
  )
  await openFromPlayer(page, course, made)
  const history = region(page, m.code_history({}, ru))
  await expect(history.getByText(formatPercent(50, 'ru'), { exact: true })).toBeVisible()
  await history.getByRole('link', { name: m.code_attempt_code({ number: 1 }, ru) }).click()
  await expect(page).toHaveURL(new RegExp(`[?&]submission=${graded.id}`))
  await expect(history.getByText(m.code_result_score({ score: formatPercent(50, 'ru') }, ru))).toBeVisible()
  await expect(history.getByText(m.code_result_cases({ passed: 1, total: 2 }, ru))).toBeVisible()
  await expect(history.getByText('Python (3.8.1)')).toBeVisible()
  await expect(history.getByRole('textbox', { name: m.code_attempt_code({ number: 1 }, ru) })).toContainText(
    'print(1 + 2)',
  )
})

// Expected failures are scoped to the endpoints exercised by these negative scenarios.
test.beforeEach(({ page }) => {
  allowFailure(page, new RegExp('^/api/v2/activities/[^/]+/assessment$'), 404)
  allowFailure(page, new RegExp('^/api/v2/assessment-items/[^/]+/runs$'), 429)
  allowFailure(page, new RegExp('^/learn/[^/]+/[^/]+/code$'), 403, 404)
})
