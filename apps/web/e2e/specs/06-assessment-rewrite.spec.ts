import { testAsStudent, testAsTeacher, expect } from '../fixtures'
import { getEnv } from '../env'

testAsTeacher.describe.serial('Assessment rewrite cockpit', () => {
  let courseUuid: string
  let examActivityId: string

  testAsTeacher.beforeAll(() => {
    courseUuid = getEnv('E2E_COURSE_UUID') ?? ''
    examActivityId = getEnv('E2E_EXAM_ACTIVITY_ID') ?? ''
  })

  testAsTeacher('teacher can open the rewritten studio and navigate core views', async ({ page }) => {
    testAsTeacher.skip(!courseUuid || !examActivityId, 'Set E2E_COURSE_UUID and E2E_EXAM_ACTIVITY_ID first.')

    await page.goto(`/dash/courses/${courseUuid}/activity/${examActivityId}/studio?view=questions`)
    await expect(page.getByRole('button', { name: /questions|constructor|вопрос|сұрақ/i }).first()).toBeVisible({
      timeout: 15_000,
    })

    await page.goto(`/dash/courses/${courseUuid}/activity/${examActivityId}/studio?view=audience`)
    await expect(page.getByRole('heading', { name: /access|доступ|қолжет/i }).first()).toBeVisible({ timeout: 15_000 })

    await page.goto(`/dash/courses/${courseUuid}/activity/${examActivityId}/studio?view=publish`)
    await expect(page.getByRole('heading', { name: /preview|предпросмотр|тексеру/i }).first()).toBeVisible({
      timeout: 15_000,
    })
  })

  testAsTeacher('teacher can operate submissions and release controls from the cockpit', async ({ page }) => {
    testAsTeacher.skip(!courseUuid || !examActivityId, 'Set E2E_COURSE_UUID and E2E_EXAM_ACTIVITY_ID first.')

    await page.goto(`/dash/courses/${courseUuid}/activity/${examActivityId}/studio?view=results`)
    await expect(page.getByRole('heading', { name: /review queue|очередь|кезек/i }).first()).toBeVisible({
      timeout: 15_000,
    })
    await expect(page.getByRole('button', { name: /export|экспорт/i }).first()).toBeVisible()
  })
})

testAsStudent.describe('Assessment rewrite student mobile smoke', () => {
  testAsStudent('student attempt route remains readable on mobile', async ({ page }) => {
    const courseUuid = getEnv('E2E_COURSE_UUID') ?? ''
    const examActivityId = getEnv('E2E_EXAM_STUDENT_ACTIVITY_ID') ?? getEnv('E2E_EXAM_ACTIVITY_ID') ?? ''
    testAsStudent.skip(!courseUuid || !examActivityId, 'Set E2E_COURSE_UUID and E2E_EXAM_STUDENT_ACTIVITY_ID first.')

    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(`/en/course/${courseUuid}/activity/${examActivityId}`)
    await expect(page.locator('body')).toBeVisible()
  })
})
