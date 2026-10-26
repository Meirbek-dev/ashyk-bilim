import { m } from '#/paraglide/messages'

import { expect, ru, test } from './attempt-fixture'

test('B-ATT-03 with no attempt left the entry leads to the teacher for a retake', async ({
  page,
  learner,
  makeQuiz,
}) => {
  const quiz = await makeQuiz({ policy: { max_attempts: 1 } })
  await learner.enroll(quiz.course)
  await learner.signIn()
  await page.goto(quiz.url)
  await page.getByRole('button', { name: m.attempt_start({}, ru) }).click()
  await expect(page).toHaveURL(/[?&]attempt=/)
  await page.getByRole('button', { name: m.attempt_submit({}, ru), exact: true }).click()
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: m.attempt_submit({}, ru), exact: true })
    .click()
  await expect(page.getByRole('heading', { level: 1, name: m.attempt_number({ number: 1 }, ru) })).toBeVisible()
  await page.goto(quiz.url)
  await expect(page.getByText(m.attempt_reason_max_attempts({}, ru))).toBeVisible()
  await expect(page.getByRole('link', { name: m.attempt_retake_ask({}, ru) })).toHaveAttribute(
    'href',
    `/courses/${quiz.course.id}/discussions`,
  )
})
