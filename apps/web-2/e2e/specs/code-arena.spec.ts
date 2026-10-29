import { expectFailure as allowFailure } from '../fixtures/test'
import { randomUUID } from 'node:crypto'

import { m } from '#/paraglide/messages'
import { setPolicy } from '#/shared/api/gen/sdk.gen'
import { formatDateTime } from '#/shared/i18n/format'

import type { MadeCourse } from '../fixtures/learning'
import {
  editor,
  expect,
  openFromPlayer,
  region,
  routeLanguages,
  ru,
  runOf,
  start,
  test,
  typeCode,
  type Made,
} from './code-arena-fixture'

// The learner's code challenge (slice 5.3): /learn/$courseId/$activityId/code. A started attempt waits for the
// draft's save pause (5 s) and a cold `vp dev` compiles the editor: each test gets a minute.
test.describe.configure({ timeout: 60_000 })

const arena = (course: MadeCourse, made: Made) => `/learn/${course.id}/${made.activityId}/code`
const problemOf = (code: string, status: number) => ({ type: 'about:blank', title: code, status, code })

test('B-COD-04 a due date says what it means for a late hand-in', async ({
  page,
  api,
  learner,
  makeCourse,
  challenges,
}) => {
  const course = await makeCourse({ activities: 1 })
  const made = await challenges.make(course)
  const due = Math.floor(Date.now() / 1000) + 3 * 86_400
  await setPolicy({
    client: api,
    path: { assessment_id: made.assessment.id },
    body: { ...made.assessment.policy, due_at_unix: due, allow_late: false },
    headers: challenges.teacher,
    throwOnError: true,
  })
  await learner.enroll(course)
  await learner.signIn()
  await routeLanguages(page)
  await page.goto(arena(course, made))
  const entry = region(page, m.code_solution({}, ru))
  await expect(entry.getByText(m.code_due({ date: formatDateTime(due, 'ru') }, ru))).toBeVisible()
  await expect(entry.getByText(m.attempt_late_closed({}, ru))).toBeVisible()
})
test('B-COD-01 only an enrolled learner opens the challenge; another activity type is not found', async ({
  page,
  learner,
  makeCourse,
  challenges,
}) => {
  const course = await makeCourse({ activities: 1 })
  const made = await challenges.make(course)
  await page.goto(arena(course, made))
  await expect(page).toHaveURL(/\/login\?redirect=/)
  await learner.signIn()
  await page.goto(arena(course, made))
  await expect(page.getByRole('heading', { name: m.platform_forbidden_title({}, ru) })).toBeVisible()
  await learner.enroll(course)
  await page.goto(`/learn/${course.id}/${course.activityIds[0]}/code`)
  await expect(page.getByRole('heading', { level: 1, name: m.player_not_found({}, ru) })).toBeVisible()
  await page.goto(arena(course, made))
  await expect(page.getByRole('heading', { level: 1, name: 'Сумма двух чисел' })).toBeVisible()
})

test('B-COD-02 a challenge the learner cannot read yet is "not set up", without an error', async ({
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
  // An unpublished challenge is answered 404 to a learner; its activity would not be in the outline, so the 404 is
  // routed here for the client navigation from the player's entry card.
  await page.route(`**/api/v2/activities/${made.activityId}/assessment`, route =>
    route.fulfill({ status: 404, contentType: 'application/problem+json', json: problemOf('not-found', 404) }),
  )
  await openFromPlayer(page, course, made)
  await expect(page.getByRole('heading', { name: m.code_not_configured_title({}, ru) })).toBeVisible()
  await expect(editor(page)).toHaveCount(0)
})

test('B-COD-03 B-COD-04 B-COD-05 B-COD-06 B-COD-09 B-COD-12 the statement, a started attempt and its saved code', async ({
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
  await page.setViewportSize({ width: 390, height: 844 })
  await openFromPlayer(page, course, made)

  const problem = region(page, m.code_problem({}, ru))
  await expect(problem.getByText(m.code_difficulty_easy({}, ru))).toBeVisible()
  const limits = `${m.code_limit_time({ seconds: '2' }, ru)} · ${m.code_limit_memory({ mb: '128' }, ru)}`
  await expect(problem.getByText(limits)).toBeVisible()
  await expect(problem.getByText('сумму')).toBeVisible()
  await expect(problem.getByText('1 <= a, b <= 100')).toBeVisible()
  await expect(problem.getByText('1 2', { exact: true })).toBeVisible()
  await expect(problem.getByText('40 60')).toHaveCount(0)

  const entry = region(page, m.code_solution({}, ru))
  await expect(entry.getByText(m.code_attempts_unlimited({ used: 0 }, ru))).toBeVisible()
  await start(page)
  await expect(editor(page)).toContainText('a, b = map(int, input().split())')
  const language = page.getByLabel(m.code_language({}, ru), { exact: true })
  await expect(language.locator('option:checked')).toHaveText('Python (3.8.1)')
  await language.selectOption('63')
  await expect(editor(page)).toContainText('const [a, b] = [1, 2]')
  await typeCode(page, 'console.log(3)')
  await expect(page.getByText(m.code_unsaved({}, ru))).toBeVisible()
  await language.selectOption('71')
  await expect(editor(page)).toContainText('console.log(3)')
  await expect(page.getByRole('button', { name: m.code_run({}, ru) })).toBeVisible()
  await expect(page.getByText(m.code_saved({}, ru), { exact: true })).toBeVisible({ timeout: 20_000 })

  // A reload renders on the server (whatever its sandbox): the code is back.
  await page.reload()
  await expect(editor(page)).toContainText('console.log(3)')
  // Reopened with the sandbox not configured: no names (the language by its number, B-COD-23), no runs.
  await page.unroute('**/api/v2/code/runner')
  await page.route('**/api/v2/code/runner', route =>
    route.fulfill({ json: { runner_configured: false, languages: [] } }),
  )
  await openFromPlayer(page, course, made)
  await expect(editor(page)).toContainText('console.log(3)')
  await expect(language.locator('option:checked')).toHaveText(m.code_language_number({ id: 71 }, ru))
  await expect(page.getByText(m.code_runner_unavailable({}, ru))).toBeVisible()
  await expect(page.getByRole('button', { name: m.code_run({}, ru) })).toBeDisabled()
})

test('B-COD-07 B-COD-08 B-COD-09 a run shows its verdicts per test; a refused run says why', async ({
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
  const keys: string[] = []
  const runId = randomUUID()
  const runs = `**/api/v2/assessment-items/${made.itemId}/runs`
  await page.route(runs, route => {
    keys.push(route.request().headers()['idempotency-key'] ?? '')
    return route.fulfill({ status: 201, json: runOf(made, runId) })
  })
  await openFromPlayer(page, course, made)
  await start(page)
  await page.getByRole('button', { name: m.code_run({}, ru) }).click()

  const result = region(page, m.code_run_title({}, ru))
  await expect(result.getByText(m.code_status_wrong_answer({}, ru))).toBeVisible()
  await expect(result.getByText(m.code_run_passed({ passed: 1, total: 2 }, ru))).toBeVisible()
  await expect(result.getByText(m.code_status_accepted({}, ru))).toBeVisible()
  await expect(result.getByText(m.code_status_runtime_error({}, ru))).toBeVisible()
  await expect(result.getByText(m.code_case_usage({ ms: '12', mb: '7,6' }, ru)).first()).toBeVisible()
  await expect(result.getByText(m.code_io_actual({}, ru))).toHaveCount(2)
  await expect(page).toHaveURL(new RegExp(`[?&]run=${runId}`))
  expect(keys).toHaveLength(1)
  expect(keys[0]).not.toBe('')

  await page.unroute(runs)
  await page.route(runs, route =>
    route.fulfill({ status: 429, contentType: 'application/problem+json', json: problemOf('rate-limited', 429) }),
  )
  await page.getByRole('button', { name: m.code_run({}, ru) }).click()
  await expect(page.getByText(m.errors_rate_limited({}, ru))).toBeVisible()
})

test('B-COD-07 B-COD-08 B-COD-10 @judge0 a real run, a reload of its verdicts and a graded hand-in', async ({
  page,
  learner,
  makeCourse,
  challenges,
}) => {
  const course = await makeCourse({ activities: 1 })
  const made = await challenges.make(course)
  await learner.enroll(course)
  await learner.signIn()
  await page.goto(arena(course, made))
  await start(page)
  await typeCode(page, 'print(sum(map(int, input().split())))')
  await page.getByRole('button', { name: m.code_run({}, ru) }).click()
  const result = region(page, m.code_run_title({}, ru))
  await expect(result.getByText(m.code_run_passed({ passed: 1, total: 1 }, ru))).toBeVisible({ timeout: 30_000 })
  // The draft is saved after a pause: the reload reads it back.
  await expect(page.getByText(m.code_saved({}, ru), { exact: true })).toBeVisible({ timeout: 20_000 })
  await page.reload()
  await expect(result.getByText(m.code_status_accepted({}, ru)).first()).toBeVisible()
  await page.getByRole('button', { name: m.code_submit({}, ru) }).click()
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: m.code_submit({}, ru) })
    .click()
  const history = region(page, m.code_history({}, ru))
  await expect(history.getByText(m.code_result_cases({ passed: 2, total: 2 }, ru))).toBeVisible({ timeout: 30_000 })
})

for (const locale of ['kk', 'en'] as const) {
  test(`B-COD-20 the challenge speaks ${locale}`, async ({
    page,
    context,
    baseURL,
    learner,
    makeCourse,
    challenges,
  }) => {
    const course = await makeCourse({ activities: 1 })
    const made = await challenges.make(course)
    await learner.enroll(course)
    await learner.signIn()
    await context.addCookies([{ name: 'ab_locale', value: locale, url: String(baseURL) }])
    await page.goto(arena(course, made))
    await expect(page.locator('html')).toHaveAttribute('lang', locale)
    await expect(page.getByRole('heading', { name: m.code_problem({}, { locale }) })).toBeVisible()
    await expect(page.getByRole('button', { name: m.code_start({}, { locale }) })).toBeVisible()
  })
}

// Expected failures are scoped to the endpoints exercised by these negative scenarios.
test.beforeEach(({ page }) => {
  allowFailure(page, new RegExp('^/api/v2/activities/[^/]+/assessment$'), 404)
  allowFailure(page, new RegExp('^/api/v2/assessment-items/[^/]+/runs$'), 429)
  allowFailure(page, new RegExp('^/learn/[^/]+/[^/]+/code$'), 403, 404)
})
