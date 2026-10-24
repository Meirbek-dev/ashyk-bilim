import { STORAGE_STATE } from '../auth-states'
import { body, expect, test } from '../fixtures/release'
import { AssessmentPage } from '../page-objects/AssessmentPage'
import { GradingReviewPage } from '../page-objects/GradingReviewPage'

test('a learner reads a fresh course and submits an answer that survives a reload', async ({ browser, course }) => {
  await body(await course.student.post(`enrollments/${course.id}`, { data: {} }))
  const context = await browser.newContext({ storageState: STORAGE_STATE.student })
  try {
    const page = await context.newPage()
    const response = await page.goto(`/en/course/${course.id}/activity/${course.activity}`)
    expect(response?.status()).toBe(200)
    const assessment = new AssessmentPage(page)
    await assessment.startAttempt()
    await assessment.answerChoice('Pick the correct answer.', 'Correct answer')
    await assessment.submitAttempt()
    const attempts = await course.student.get(`assessments/${course.assessment}/submissions/me`)
    expect(attempts.ok()).toBe(true)
    const submissions = await attempts.json()
    expect(submissions).toHaveLength(1)
    expect(submissions[0].status).toBe('graded')
    expect(submissions[0].release_state).toBe('awaiting_release')
    await page.reload()
    await expect(page.getByText(/score|result|passed|submitted|release/i).first()).toBeVisible()
  } finally {
    await context.close()
  }
})

test('a teacher publishes a real learner submission from its grading workspace', async ({ browser, course }) => {
  await body(await course.student.post(`enrollments/${course.id}`, { data: {} }))
  const draft = await body(await course.student.post(`assessments/${course.assessment}/submissions`, { data: {} }))
  await body(await course.student.post(`submissions/${draft.id}/submit`, { data: { answers: {} } }))
  const context = await browser.newContext({ storageState: STORAGE_STATE.teacher })
  try {
    const page = await context.newPage()
    const response = await page.goto(
      `/en/dash/courses/${course.id}/activity/${course.activity}/review?submission=${draft.id}`,
    )
    expect(response?.status()).toBe(200)
    await expect(page.getByText('Release question', { exact: true }).first()).toBeVisible()
    const publish = new GradingReviewPage(page).publishButton
    await expect(publish).toBeEnabled()
    await publish.click()
    await expect
      .poll(async () => (await body(await course.student.get(`submissions/${draft.id}`))).status)
      .toBe('published')
  } finally {
    await context.close()
  }
})
