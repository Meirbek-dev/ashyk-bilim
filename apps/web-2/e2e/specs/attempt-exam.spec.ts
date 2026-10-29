import { expectFailure as allowFailure } from '../fixtures/test'
import type { Page } from '@playwright/test'

import { m } from '#/paraglide/messages'

import { expect, items, type MadeQuiz, ru, test } from './attempt-fixture'

// An exam's rules during an attempt: consent, copying reported, the violation limit, full screen on a phone.

test.describe.configure({ timeout: 90_000 })

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

test('B-ATT-19 B-ATT-21 past the violation limit the hand-in scores zero and says why', async ({
  page,
  learner,
  makeQuiz,
}) => {
  const quiz = await makeQuiz({
    kind: 'exam',
    policy: {
      time_limit_seconds: null,
      tab_switch_detection: false,
      fullscreen_required: false,
      violation_threshold: 1,
    },
  })
  await learner.enroll(quiz.course)
  await learner.signIn()
  await start(page, quiz, { consent: true })
  await page.getByRole('radio', { name: 'Астана' }).check()
  await page.getByRole('heading', { level: 1, name: items.single.title }).click()
  await page.keyboard.press('ControlOrMeta+C')
  await expect(page.getByText(m.attempt_violations_exceeded({}, ru))).toBeVisible()
  await handIn(page)
  await expect(page.getByText(m.attempt_auto_violation({}, ru))).toBeVisible()
})
test('B-ATT-04 B-ATT-21 B-ATT-18 an exam: rules accepted (stored), copying reported, the grade waits for release', async ({
  page,
  learner,
  makeQuiz,
}) => {
  const quiz = await makeQuiz({
    kind: 'exam',
    policy: { time_limit_seconds: null, tab_switch_detection: false, fullscreen_required: false },
  })
  await learner.enroll(quiz.course)
  await learner.signIn()
  await page.goto(quiz.url)
  await expect(page.getByText(m.attempt_rule_copy_paste({}, ru))).toBeVisible()
  await expect(page.getByRole('button', { name: m.attempt_start({}, ru) })).toBeDisabled()
  const started = page.waitForResponse(answer => /\/assessments\/[^/]+\/submissions$/.test(answer.url()))
  await start(page, quiz, { consent: true })
  expect((await started).request().postDataJSON()).toEqual({ rules_accepted: true })
  expect(await (await started).json()).toMatchObject({ rules_accepted_at_unix: expect.any(Number) })
  await page.getByRole('heading', { level: 1, name: items.single.title }).click()
  await page.keyboard.press('ControlOrMeta+C')
  await expect(page.getByText(m.attempt_violations({ count: 1, threshold: 3 }, ru))).toBeVisible()
  await page.getByRole('radio', { name: 'Астана' }).check()
  await handIn(page)
  await expect(page.getByText(m.attempt_awaiting_text({}, ru))).toBeVisible()
  await expect(page.getByText(m.attempt_status_graded({}, ru))).toBeVisible()
})
test('B-ATT-21 an exam that asks for full screen starts on a phone without page full screen (iPhone Safari)', async ({
  page,
  learner,
  makeQuiz,
}) => {
  const quiz = await makeQuiz({
    kind: 'exam',
    policy: { time_limit_seconds: null, tab_switch_detection: false, fullscreen_required: true },
  })
  await page.addInitScript(() => {
    Reflect.deleteProperty(Element.prototype, 'requestFullscreen')
    Object.defineProperty(Document.prototype, 'fullscreenEnabled', { get: () => false })
  })
  await learner.enroll(quiz.course)
  await learner.signIn()
  await start(page, quiz, { consent: true })
  await expect(page.getByRole('heading', { level: 1, name: items.single.title })).toBeVisible()
  await expect(page.getByText(m.attempt_fullscreen_needed({}, ru))).toHaveCount(0)
})
// Expected failures are scoped to the endpoints exercised by these negative scenarios.
test.beforeEach(({ page }) => {
  allowFailure(page, new RegExp('^/api/v2/submissions/[^/]+/(draft|submit)$'), 409, 429)
  allowFailure(page, new RegExp('^/api/v2/assessments/[^/]+/submissions$'), 403, 409, 429)
})
