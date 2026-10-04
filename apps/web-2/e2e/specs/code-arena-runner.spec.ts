import { m } from '#/paraglide/messages'

import {
  editor,
  expect,
  openFromPlayer,
  region,
  routeLanguages,
  ru,
  runnerDown,
  start,
  test,
  typeCode,
} from './code-arena-fixture'

// A configured runner that is down (Judge0 outage): `/code/runner` and a run answer 503 `code-runner-degraded`.
test.describe.configure({ timeout: 60_000 })

test('B-COD-23 a runner that is down leaves the statement, the saved code and the history; Run and Submit wait for Retry', async ({
  page,
  learner,
  makeCourse,
  challenges,
}) => {
  const course = await makeCourse({ activities: 1 })
  const made = await challenges.make(course)
  await learner.enroll(course)
  await learner.signIn()
  await page.route('**/api/v2/code/runner', route => route.fulfill(runnerDown))
  await openFromPlayer(page, course, made)
  await expect(region(page, m.code_problem({}, ru)).getByText('сумму')).toBeVisible()
  await start(page)
  await typeCode(page, 'print(3)')
  await expect(page.getByText(m.code_saved({}, ru), { exact: true })).toBeVisible({ timeout: 20_000 })
  const run = page.getByRole('button', { name: m.code_run({}, ru) })
  const down = page.getByText(m.code_runner_down({}, ru))
  await expect(down).toBeVisible()
  await expect(run).toBeDisabled()
  await expect(page.getByRole('button', { name: m.code_submit({}, ru) })).toBeDisabled()
  await expect(region(page, m.code_history({}, ru)).getByText(m.code_attempt({ number: 1 }, ru))).toBeVisible()

  await page.unroute('**/api/v2/code/runner')
  await routeLanguages(page)
  await page.getByRole('button', { name: m.ui_retry({}, ru) }).click()
  await expect(down).toHaveCount(0)
  await expect(run).toBeEnabled()

  await page.route(`**/api/v2/assessment-items/${made.itemId}/runs`, route => route.fulfill(runnerDown))
  await run.click()
  await expect(down).toBeVisible()
  await expect(editor(page)).toContainText('print(3)')
})
