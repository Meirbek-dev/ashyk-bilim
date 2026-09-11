/**
 * SPEC: Student – The Learning Journey (Phase 2)
 *
 * As the Student, navigate through the course created in Phase 1:
 *  - Enroll in the course
 *  - Visit every lecture block and mark complete
 *  - Complete the coding challenge
 *  - Upload the file submission
 *  - Complete the exam with a passing score
 *  - Verify the certificate appears only after all requirements are met
 *
 * Prerequisites:
 *  - Course must exist and be published (from spec 03)
 *  - Course UUID is read from process.env.E2E_COURSE_UUID
 *
 * Bug policy: If any step fails due to application bugs, the test MUST remain
 * failing. Never lower assertions or add workarounds to hide failures.
 */

import { testAsStudent as test, expect } from '../fixtures'
import { getEnv, setEnv } from '../env'
import { JUDGE0_SKIP_REASON, judge0Missing } from '../fixtures/environment'
import { COURSE, CORRECT_PYTHON_SOLUTION, EXAM_ANSWERS, SAMPLE_PDF } from '../fixtures/test-data'
import { ensureFixtureFiles } from '../utils/fixtures'

test.describe.serial('Student – Learning Journey', () => {
  let courseUuid: string

  test.beforeAll(async () => {
    courseUuid = getEnv('E2E_COURSE_UUID') ?? ''
    if (!courseUuid) {
      throw new Error('E2E_COURSE_UUID not set. Run the course-creation spec first, or set it manually.')
    }
    ensureFixtureFiles()
  })

  // ── 1. Enroll ───────────────────────────────────────────────────────────

  test('student can navigate to the course landing page', async ({ page }) => {
    await page.goto(`/en/course/${courseUuid}`)
    await page.waitForLoadState('networkidle')

    // Course title must be visible (v2 landing shows it in the breadcrumb; the
    // hero card was removed deliberately, see 80bbe59 / c0a7bdf)
    await expect(page.getByRole('link', { name: COURSE.title })).toBeVisible({ timeout: 15_000 })
  })

  test('student can enroll in the course', async ({ page, coursePlayerPage }) => {
    await coursePlayerPage.gotoCourseLanding(courseUuid)

    // If an Enroll button exists, click it
    if (await coursePlayerPage.enrollButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await coursePlayerPage.enroll()
    }

    // After enroll, the course content / activity list should be accessible
    await expect(page.locator('nav, aside, [aria-label*="activities"]').first()).toBeVisible({
      timeout: 10_000,
    })
  })

  // ── 2. Complete the lecture activity ────────────────────────────────────

  test('student can open the Introduction Lecture activity', async ({ page, coursePlayerPage }) => {
    await coursePlayerPage.gotoCourseLanding(courseUuid)
    // v2: the landing outline ("Course Lessons") links each activity
    await coursePlayerPage.openActivity(new RegExp(COURSE.activities.dynamicLecture, 'i'))
    // The lecture content typed in spec 03 must render for the learner
    await expect(page.getByText('Introduction to the Course')).toBeVisible({ timeout: 10_000 })
  })

  test('student can mark the lecture activity as complete', async ({ page, coursePlayerPage }) => {
    await coursePlayerPage.gotoCourseLanding(courseUuid)
    await coursePlayerPage.openActivity(new RegExp(COURSE.activities.dynamicLecture, 'i'))

    // The "Mark as complete" button should be visible
    await expect(coursePlayerPage.markCompleteButton).toBeVisible({
      timeout: 10_000,
    })
    await coursePlayerPage.markComplete()

    // v2 feedback: the "Activity completed" toast, the CTA stops offering
    // "Mark as complete" and the outline counts the chapter as 1/1 done
    await expect(page.getByText(/activity completed/i).first()).toBeVisible({ timeout: 10_000 })
    await expect(coursePlayerPage.markCompleteButton).toBeHidden({ timeout: 10_000 })
    await expect(page.getByRole('navigation', { name: /course content/i }).getByText(/^1\/1$/).first()).toBeVisible({
      timeout: 10_000,
    })
  })

  // ── 3. File submission ──────────────────────────────────────────────────

  test('student can navigate to the File Submission activity', async ({ coursePlayerPage }) => {
    await coursePlayerPage.gotoCourseLanding(courseUuid)
    const activityId = await coursePlayerPage.openActivity(new RegExp(COURSE.activities.fileSubmission, 'i'))
    // Store the activity id for grading spec
    setEnv('E2E_FILE_SUBMISSION_ACTIVITY_ID', activityId)
  })

  /**
   * BUG PROTOCOL: If the file upload input is not rendered or the submission
   * POST fails, this test MUST remain failing. The feature is broken.
   */
  test('student can upload a PDF and submit the file submission activity', async ({ page, fileSubmissionPage }) => {
    const activityId = getEnv('E2E_FILE_SUBMISSION_ACTIVITY_ID')
    if (!activityId) {
      test.skip(true, 'File submission activity ID not captured in prior test')
      return
    }

    await page.goto(`/en/course/${courseUuid}/activity/${activityId}`)
    await page.waitForLoadState('networkidle')

    await fileSubmissionPage.uploadAndSubmit(SAMPLE_PDF)
    await fileSubmissionPage.assertSubmitted()
  })

  // ── 4. Exam ─────────────────────────────────────────────────────────────

  test('student can navigate to the Final Exam activity', async ({ coursePlayerPage }) => {
    await coursePlayerPage.gotoCourseLanding(courseUuid)
    const activityId = await coursePlayerPage.openActivity(new RegExp(COURSE.activities.exam, 'i'))
    setEnv('E2E_EXAM_STUDENT_ACTIVITY_ID', activityId)
  })

  /**
   * BUG PROTOCOL: The exam start button must be visible and clickable.
   * If the assessment shell fails to render, the test MUST fail.
   *
   * v2: starting, answering and submitting happen in ONE test on purpose — the
   * exam's anti-cheat treats a page reload mid-attempt as leaving the exam and
   * auto-submits it, and the attempt limit is 1.
   */
  test('student can start an exam attempt, answer the questions and submit', async ({ page, assessmentPage }) => {
    const activityId = getEnv('E2E_EXAM_STUDENT_ACTIVITY_ID')
    if (!activityId) {
      test.skip(true, 'Exam activity ID not captured in prior test')
      return
    }

    await page.goto(`/en/course/${courseUuid}/activity/${activityId}`)
    await page.waitForLoadState('networkidle')

    await expect(assessmentPage.startButton).toBeVisible({ timeout: 10_000 })
    await assessmentPage.startAttempt()

    // After starting, question content must be visible
    await expect(page.getByRole('group').first()).toBeVisible({ timeout: 10_000 })

    // Questions and options are shuffled — answer by text
    const exact = (text: string) => new RegExp(`^${text}$`)
    await assessmentPage.answerChoice(EXAM_ANSWERS.singleChoice.question, exact(EXAM_ANSWERS.singleChoice.answer))
    await assessmentPage.answerChoice(EXAM_ANSWERS.trueFalse.question, exact(EXAM_ANSWERS.trueFalse.answer))
    await assessmentPage.answerMultiSelect(EXAM_ANSWERS.multiSelect.question, EXAM_ANSWERS.multiSelect.answers.map(exact))

    // Submit the exam
    await assessmentPage.submitAttempt()

    // A result / receipt should be displayed after submission
    await expect(page.getByText(/submission received|score|result|passed/i).first()).toBeVisible({
      timeout: 15_000,
    })
  })

  // ── 5. Certificate check ────────────────────────────────────────────────

  /**
   * Certificate should NOT be available before the teacher grades the submission.
   * This test documents the expected (correct) state.
   */
  test('certificate is not yet available before teacher grades work', async ({ coursePlayerPage }) => {
    // v2: certificates are offered on the Progress page (/trail) course card;
    // nothing must be offered while the file submission and exam are ungraded
    await coursePlayerPage.assertCertificateNotAvailable(courseUuid)
  })

  // ── 6. Code challenge ───────────────────────────────────────────────────
  // Last on purpose: the v2 code challenge can only be authored (languages
  // tab) and published when Judge0 answers `GET code/languages`; without
  // Judge0 the teacher cannot publish it and the learner gets "not found".
  // Keeping it last lets the rest of the chain run when the service is down.

  test('student can navigate to and submit the coding challenge', async ({ page, assessmentPage, coursePlayerPage }) => {
    test.skip(judge0Missing(), JUDGE0_SKIP_REASON)
    await coursePlayerPage.gotoCourseLanding(courseUuid)
    const activityId = await coursePlayerPage.openActivity(new RegExp(COURSE.activities.codeChallenge, 'i'))
    setEnv('E2E_CODE_ACTIVITY_ID', activityId)

    // Fill and submit the code solution
    if (await assessmentPage.codeEditor.isVisible({ timeout: 5000 }).catch(() => false)) {
      await assessmentPage.fillCodeEditor(CORRECT_PYTHON_SOLUTION)
      await assessmentPage.submitCode()

      // Wait for evaluation result
      await expect(page.getByText(/passed|correct|submitted/i).first()).toBeVisible({
        timeout: 30_000,
      })
    } else {
      // BUG PROTOCOL: Code editor not visible — test must fail
      await expect(assessmentPage.codeEditor).toBeVisible({ timeout: 1 })
    }
  })
})
