import { expectFailure as allowFailure, expectReread } from '../fixtures/test'
import type { Page } from '@playwright/test'

import { m } from '#/paraglide/messages'
import { formatDateTime, formatPercent } from '#/shared/i18n/format'

import { expect, items, type MadeQuiz, ru, test } from './attempt-fixture'

test.describe.configure({ timeout: 90_000 })

const status = (page: Page) => page.getByRole('banner').locator('output')
const dialog = (page: Page) => page.getByRole('alertdialog')

/** The learner opens the entry and starts (accepting the rules when the exam has them). */
async function start(page: Page, quiz: MadeQuiz, { consent = false } = {}) {
  await page.goto(quiz.url)
  if (consent) await page.getByRole('checkbox', { name: m.attempt_consent({}, ru) }).check()
  await page.getByRole('button', { name: m.attempt_start({}, ru) }).click()
  await expect(page).toHaveURL(/[?&]attempt=/)
}

async function handIn(page: Page) {
  await page.getByRole('button', { name: m.attempt_submit({}, ru), exact: true }).click()
  await dialog(page)
    .getByRole('button', { name: m.attempt_submit({}, ru), exact: true })
    .click()
  await expect(page.getByRole('heading', { level: 1, name: m.attempt_number({ number: 1 }, ru) })).toBeVisible()
}

test('B-ATT-01 a guest signs in first; the course staff open a preview', async ({ page, makeQuiz, signInAs }) => {
  const quiz = await makeQuiz()
  await page.goto(quiz.url)
  await expect(page).toHaveURL(/\/login\?redirect=/)
  await signInAs('teacher')
  await page.goto(quiz.url)
  await expect(page.getByText(m.player_preview_title({}, ru), { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: m.attempt_start({}, ru) })).toBeVisible()
})

test('B-ATT-02 B-ATT-03 B-ATT-05 B-ATT-06 B-ATT-07 B-ATT-09 B-ATT-16 B-ATT-18 B-ATT-24 a whole attempt, start to result', async ({
  page,
  learner,
  makeQuiz,
}) => {
  const quiz = await makeQuiz({ questions: [items.single, items.multiple, items.matching] })
  await learner.enroll(quiz.course)
  await learner.signIn()
  await page.goto(quiz.url)
  await expect(page.getByText(m.attempt_questions({ count: '3' }, ru))).toBeVisible()
  await expect(page.getByText(m.attempt_attempts_unlimited_fresh({}, ru))).toBeVisible()
  await expect(page.getByText(m.attempt_review_full({}, ru))).toBeVisible()
  await start(page, quiz)
  await expect(page.getByRole('heading', { level: 1, name: items.single.title })).toBeVisible()
  await page.getByRole('radio', { name: 'Астана' }).check()
  await page.getByRole('link', { name: m.attempt_next({}, ru) }).click()
  await expect(page).toHaveURL(/item=2/)
  await expect(page.getByRole('heading', { level: 1, name: items.multiple.title })).toBeFocused()
  await page.getByRole('link', { name: m.attempt_next({}, ru) }).click()
  await page.getByLabel('Кошка').selectOption('Мяу')
  await page.getByLabel('Собака').selectOption('Гав')
  // The reload keeps the question (the URL) and the answers.
  await page.reload()
  await expect(page.getByLabel('Собака')).toHaveValue('Гав')
  await expect(status(page)).toHaveText(m.attempt_saved({}, ru), { timeout: 20_000 })
  // The second question is left out: the last question's "Finish attempt" asks, listing it and leading to it.
  await page.getByRole('button', { name: m.attempt_finish({}, ru) }).click()
  await expect(dialog(page).getByText(m.attempt_unanswered({ count: 1 }, ru))).toBeVisible()
  await dialog(page)
    .getByRole('link', { name: m.attempt_question_number({ number: 2 }, ru) })
    .click()
  await expect(page.getByRole('heading', { level: 1, name: items.multiple.title })).toBeVisible()
  await page.getByRole('checkbox', { name: 'Два' }).check()
  await page.getByRole('checkbox', { name: 'Четыре' }).check()
  await handIn(page)
  await expect(page.getByRole('region', { name: m.attempt_score_label({}, ru) })).toContainText(
    formatPercent(100, 'ru'),
  )
  await expect(page.getByText(m.attempt_correct({}, ru)).first()).toBeVisible()
  // Every answer is right, so no «Правильный ответ» line repeats it (shown only under a wrong answer).
  await expect(page.getByText(`${m.attempt_correct_answer({}, ru)}: Астана`)).toHaveCount(0)
  // Points on the item's own scale (1 point each), not its share of 100 («33,33 из 33,33»).
  await expect(page.getByText(m.attempt_item_points({ score: '1', max: '1' }, ru))).toHaveCount(3)
  await page.getByRole('link', { name: m.attempt_all_attempts({}, ru) }).click()
  await expect(page.getByRole('link', { name: m.attempt_number({ number: 1 }, ru) })).toBeVisible()
  await expect(page.getByText(m.attempt_attempts_unlimited({ used: '1' }, ru))).toBeVisible()
})

test('B-ATT-10 a reload before the save lands keeps the answer and sends it', async ({
  page,
  learner,
  makeQuiz,
  attempts,
}) => {
  const quiz = await makeQuiz()
  await learner.enroll(quiz.course)
  await learner.signIn()
  await start(page, quiz)
  // The server keeps answering "too often" (a 4xx, so the browser logs no network error): the answer stays queued.
  await page.route('**/draft', route =>
    route.fulfill({ status: 429, headers: { 'retry-after': '30' }, json: { status: 429, code: 'rate-limited' } }),
  )
  await page.getByRole('radio', { name: 'Астана' }).check()
  await expect(status(page)).toHaveText(m.attempt_saving({}, ru))
  await page.unroute('**/draft')
  await page.reload()
  await expect(page.getByRole('radio', { name: 'Астана' })).toBeChecked()
  await expect(status(page)).toHaveText(m.attempt_saved({}, ru), { timeout: 20_000 })
  await expect.poll(async () => (await attempts(quiz))[0]?.answered_count).toBe(1)
})

test('B-ATT-11 B-ATT-09 offline answers wait in the queue and go out when the network is back', async ({
  page,
  context,
  learner,
  makeQuiz,
  attempts,
}) => {
  const quiz = await makeQuiz()
  await learner.enroll(quiz.course)
  await learner.signIn()
  await start(page, quiz)
  // The question's lazy parts are loaded before the network goes: the rendered prompt, not its plain-text stand-in.
  await expect(page.locator('.ab-prose').getByText('Выберите город.')).toBeVisible()
  await expect(status(page)).toHaveText(m.attempt_saved({}, ru))
  await context.setOffline(true)
  await page.getByRole('radio', { name: 'Алматы' }).check()
  await expect(status(page)).toHaveText(m.attempt_offline({}, ru))
  await context.setOffline(false)
  await expect(status(page)).toHaveText(m.attempt_saved({}, ru), { timeout: 20_000 })
  await expect.poll(async () => (await attempts(quiz))[0]?.answered_count).toBe(1)
})

test('B-ATT-12 a draft saved in another tab opens the conflict dialog and keeps both answers', async ({
  page,
  context,
  learner,
  makeQuiz,
  attempts,
}) => {
  const quiz = await makeQuiz({ questions: [items.single, items.multiple] })
  await learner.enroll(quiz.course)
  await learner.signIn()
  await start(page, quiz)
  const other = await context.newPage()
  allowFailure(other, /^\/api\/v2\/submissions\/[^/]+\/draft$/, 409, 429)
  await other.goto(`${page.url().replace(/&?item=\d+/, '')}&item=2`)
  await expect(other.getByRole('heading', { level: 1, name: items.multiple.title })).toBeVisible()
  await page.getByRole('radio', { name: 'Астана' }).check()
  await expect(status(page)).toHaveText(m.attempt_saved({}, ru), { timeout: 20_000 })
  await other.getByRole('checkbox', { name: 'Два' }).check()
  await expect(other.getByRole('alertdialog')).toContainText(m.ui_conflict_title({}, ru))
  // The server takes one save per draft every 5 s: retry after the window.
  await other.waitForTimeout(5_500)
  await other.getByRole('button', { name: m.ui_conflict_retry({}, ru) }).click()
  await expect(other.getByRole('banner').locator('output')).toHaveText(m.attempt_saved({}, ru), { timeout: 20_000 })
  await expect.poll(async () => (await attempts(quiz))[0]?.answered_count).toBe(2)
  await other.close()
})
test('B-ATT-14 at zero the attempt is handed in by itself with the answers given', async ({
  page,
  learner,
  makeQuiz,
}) => {
  const quiz = await makeQuiz({ policy: { time_limit_seconds: 12 } })
  await learner.enroll(quiz.course)
  await learner.signIn()
  await start(page, quiz)
  await expect(page.locator('time')).toBeVisible()
  await page.getByRole('radio', { name: 'Астана' }).check()
  await expect(page.getByRole('heading', { level: 1, name: m.attempt_number({ number: 1 }, ru) })).toBeVisible({
    timeout: 30_000,
  })
  await expect(page.getByRole('region', { name: m.attempt_score_label({}, ru) })).toContainText(
    formatPercent(100, 'ru'),
  )
})
test('B-ATT-02 the conditions say what the due date means for a late hand-in', async ({ page, learner, makeQuiz }) => {
  const due = Math.floor(Date.now() / 1000) + 3 * 86_400
  const strict = await makeQuiz({ policy: { due_at_unix: due, allow_late: false } })
  const penalty = await makeQuiz({
    policy: { due_at_unix: due, allow_late: true, late_policy: { kind: 'penalty', percent_per_day: 10, max_days: 3 } },
  })
  await learner.enroll(strict.course)
  await learner.enroll(penalty.course)
  await learner.signIn()
  await page.goto(strict.url)
  await expect(page.getByText(m.attempt_late_closed({}, ru))).toBeVisible()
  await page.goto(penalty.url)
  await expect(
    page.getByText(m.attempt_late_penalty_rule({ percent: formatPercent(10, 'ru'), days: '3' }, ru)),
  ).toBeVisible()
})
test('B-ATT-14 a strict due date reads «Сдать до» until its last day, then counts down', async ({
  page,
  learner,
  makeQuiz,
}) => {
  const now = Math.floor(Date.now() / 1000)
  const due = Math.ceil((now + 3 * 86_400) / 60) * 60
  const far = await makeQuiz({ policy: { due_at_unix: due, allow_late: false } })
  const near = await makeQuiz({ policy: { due_at_unix: now + 7_200, allow_late: false } })
  await learner.enroll(far.course)
  await learner.enroll(near.course)
  await learner.signIn()
  await start(page, far)
  await expect(page.getByText(m.attempt_due_by({ date: formatDateTime(due, 'ru') }, ru))).toBeVisible()
  await expect(page.getByRole('banner').locator('time')).toHaveCount(0)
  await start(page, near)
  await expect(page.getByRole('banner').locator('time')).toHaveText(/^1:5\d:\d\d$/)
})
test('B-ATT-17 a test changed under the draft: the hand-in reopens it on the new questions', async ({
  page,
  learner,
  makeQuiz,
  changeQuiz,
}) => {
  const quiz = await makeQuiz()
  await learner.enroll(quiz.course)
  await learner.signIn()
  await start(page, quiz)
  await page.getByRole('radio', { name: 'Астана' }).check()
  await expect(status(page)).toHaveText(m.attempt_saved({}, ru), { timeout: 20_000 })
  await changeQuiz(quiz)
  // The reopened draft reads the changed questions again on purpose, and the reopen changed the attempt list the
  // return note reads.
  expectReread(page, `/api/v2/activities/${quiz.course.activityIds.at(-1)}/assessment`)
  expectReread(page, `/api/v2/assessments/${quiz.assessmentId}/submissions/me`)
  await page.getByRole('button', { name: m.attempt_submit({}, ru), exact: true }).click()
  await dialog(page)
    .getByRole('button', { name: m.attempt_submit({}, ru), exact: true })
    .click()
  // The confirmation steps aside for the notice, and the question is the changed one (not the page's old copy).
  await expect(page.getByText(m.attempt_changed({}, ru))).toBeVisible()
  await expect(dialog(page)).toBeHidden()
  await expect(page.getByRole('radio', { name: 'Астана!' })).toBeChecked()
  await handIn(page)
})
test('B-ATT-18 B-ATT-07 an open answer and a form wait for the teacher', async ({ page, learner, makeQuiz }) => {
  const quiz = await makeQuiz({ questions: [items.open, items.form] })
  await learner.enroll(quiz.course)
  await learner.signIn()
  await start(page, quiz)
  await page.getByLabel(m.attempt_your_answer({}, ru)).fill('Пара слов')
  await page.getByRole('link', { name: m.attempt_next({}, ru) }).click()
  await page.getByLabel('Город').fill('Астана')
  await handIn(page)
  await expect(page.getByText(m.attempt_pending_text({}, ru))).toBeVisible()
})
for (const locale of ['kk', 'en'] as const) {
  test(`B-ATT-22 the attempt speaks ${locale}`, async ({ page, context, baseURL, learner, makeQuiz }) => {
    const quiz = await makeQuiz()
    await learner.enroll(quiz.course)
    await learner.signIn()
    await context.addCookies([{ name: 'ab_locale', value: locale, url: String(baseURL) }])
    await page.goto(quiz.url)
    await expect(page.locator('html')).toHaveAttribute('lang', locale)
    await page.getByRole('button', { name: m.attempt_start({}, { locale }) }).click()
    await expect(page.getByRole('button', { name: m.attempt_submit({}, { locale }), exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: m.attempt_back({}, { locale }) })).toBeVisible()
  })
}
// Expected failures are scoped to the endpoints exercised by these negative scenarios.
test.beforeEach(({ page }) => {
  allowFailure(page, new RegExp('^/api/v2/submissions/[^/]+/(draft|submit)$'), 409, 429)
  allowFailure(page, new RegExp('^/api/v2/assessments/[^/]+/submissions$'), 403, 409, 429)
})
