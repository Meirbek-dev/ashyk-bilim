import { randomUUID } from 'node:crypto'

import type { Page } from '@playwright/test'

import { m } from '#/paraglide/messages'
import { formatPercent } from '#/shared/i18n/format'

import type { MadeCourse } from '../fixtures/learning'
import { expect, gradedAttempt, openFromPlayer, routeLanguages, ru, runOf, test, type Made } from './code-arena-fixture'

// The learner's code challenge (slice 5.3): /learn/$courseId/$activityId/code. A started attempt waits for the
// draft's save pause (5 s) and a cold `vp dev` compiles the editor: each test gets a minute.
test.describe.configure({ timeout: 60_000 })

const arena = (course: MadeCourse, made: Made) => `/learn/${course.id}/${made.activityId}/code`
const region = (page: Page, name: string) => page.getByRole('region', { name })
const editor = (page: Page) => page.getByRole('textbox', { name: m.code_editor_label({}, ru) })
const problemOf = (code: string, status: number) => ({ type: 'about:blank', title: code, status, code })

async function typeCode(page: Page, code: string) {
  await editor(page).click()
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.type(code)
}

async function start(page: Page) {
  await region(page, m.code_solution({}, ru))
    .getByRole('button', { name: m.code_start({}, ru) })
    .click()
  await expect(editor(page)).toBeVisible()
}

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

  // A reload renders on the server, where the sandbox is not configured: no names, no runs, the code is back.
  await page.reload()
  await expect(editor(page)).toContainText('console.log(3)')
  await expect(language.locator('option:checked')).toHaveText(m.code_language_unknown({ id: 71 }, ru))
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
