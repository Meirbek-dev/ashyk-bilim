/**
 * SPEC: Teacher – Grading Loop (Phase 3 & 4)
 *
 * As the Teacher, navigate to the grading dashboard and:
 *  - Review the student's file submission → assign score + feedback → approve
 *  - Review the code challenge submission → approve
 *  - Verify submission status updates to "Graded"
 *
 * Then re-check as the Student that the certificate is now downloadable.
 *
 * Bug policy: If the gradebook table doesn't render, the GradeForm inputs
 * are missing, or the grade POST fails — the tests MUST remain failing.
 */

import { testAsTeacher as test, expect } from '../fixtures'
import { getEnv, setEnv } from '../env'
import { USERS } from '../fixtures/test-data'

test.describe.serial('Teacher – Grading Loop', () => {
  let courseUuid: string
  let fileSubmissionActivityId: string
  let examActivityId: string

  test.beforeAll(async () => {
    courseUuid = getEnv('E2E_COURSE_UUID') ?? ''
    fileSubmissionActivityId = getEnv('E2E_FILE_SUBMISSION_ACTIVITY_ID') ?? ''
    examActivityId = getEnv('E2E_EXAM_ACTIVITY_ID') ?? ''

    if (!courseUuid) {
      throw new Error('E2E_COURSE_UUID not set. Run spec 03 (course creation) first.')
    }
  })

  // ── 1. Gradebook ─────────────────────────────────────────────────────────

  test('teacher can navigate to the course gradebook', async ({ page, gradebookPage }) => {
    await gradebookPage.goto(courseUuid)
    // v2 titles the gradebook stage "Course progress"
    await expect(page.getByRole('heading', { name: /course progress|gradebook|grades/i }).first()).toBeVisible({
      timeout: 15_000,
    })
  })

  test('gradebook shows the student submission that needs grading', async ({ page, gradebookPage }) => {
    await gradebookPage.goto(courseUuid)
    const studentEmailLocalPart = USERS.student.email.split('@')[0] ?? USERS.student.email

    // The student's name or email should appear somewhere in the table
    await expect(page.getByText(new RegExp(studentEmailLocalPart, 'i')).first()).toBeVisible({
      timeout: 15_000,
    })
  })

  // ── 2. Grade file submission ──────────────────────────────────────────────

  /**
   * BUG PROTOCOL: If the submission list on the review page is empty despite the
   * student having submitted, this is a bug. The test MUST fail — do not skip.
   */
  test('teacher can open the file submission review page', async ({ gradebookPage, gradingReviewPage }) => {
    if (!fileSubmissionActivityId) {
      test.skip(true, 'File submission activity ID not captured — run student journey first')
    }
    await gradebookPage.gotoActivityReview(courseUuid, fileSubmissionActivityId)

    // The queue (v2: learner buttons "<name> Attempt N · …") should show the student's attempt
    await expect(gradingReviewPage.submissionItem(new RegExp(USERS.student.firstName, 'i'))).toBeVisible({
      timeout: 15_000,
    })
  })

  test('teacher can select the student submission and see the uploaded file', async ({ page, gradingReviewPage }) => {
    if (!fileSubmissionActivityId) {
      test.skip(true, 'File submission activity ID not captured — run student journey first')
    }
    await gradingReviewPage.goto(courseUuid, fileSubmissionActivityId)

    await gradingReviewPage.selectSubmission(USERS.student.firstName)

    // The uploaded file name should be visible in the inspector pane
    await expect(page.getByText(/sample\.pdf|\.pdf/i).first()).toBeVisible({
      timeout: 10_000,
    })
  })

  test('teacher can assign a score and feedback to the file submission', async ({ gradingReviewPage }) => {
    if (!fileSubmissionActivityId) {
      test.skip(true, 'File submission activity ID not captured — run student journey first')
    }
    await gradingReviewPage.goto(courseUuid, fileSubmissionActivityId)
    await gradingReviewPage.selectSubmission(USERS.student.firstName)

    await gradingReviewPage.gradeSubmission({
      score: 85,
      feedback: 'Good work! The submission meets all requirements.',
    })
  })

  test('file submission status updates to Graded after teacher review', async ({ gradingReviewPage }) => {
    if (!fileSubmissionActivityId) {
      test.skip(true, 'File submission activity ID not captured — run student journey first')
      return
    }
    await gradingReviewPage.goto(courseUuid, fileSubmissionActivityId)
    await gradingReviewPage.selectSubmission(USERS.student.firstName)
    await gradingReviewPage.assertGradedStatus(USERS.student.firstName)
  })

  // ── 3. Grade the exam submission ──────────────────────────────────────────

  test('teacher can navigate to the exam review page via gradebook', async ({ page, gradebookPage }) => {
    if (!examActivityId) {
      test.skip(true, 'Exam activity ID not set — run course creation spec first')
      return
    }
    await gradebookPage.gotoActivityReview(courseUuid, examActivityId)
    expect(page.url()).toContain(`/activity/${examActivityId}/review`)
  })

  test('teacher can release the exam grade to the student', async ({ page, gradingReviewPage }) => {
    if (!examActivityId) {
      test.skip(true, 'Exam activity ID not set — run course creation spec first')
      return
    }
    await gradingReviewPage.goto(courseUuid, examActivityId)

    // The student's auto-graded attempt must be in the queue (BUG PROTOCOL: if
    // it is missing despite the learner submitting, this fails — do not skip)
    // The assessment queue labels entries by display name or "@username"
    const learner = new RegExp(`${USERS.student.firstName}|@${USERS.student.email.split('@')[0]}`, 'i')
    await gradingReviewPage.selectSubmission(learner)
    // The workspace mirrors the selection into `?submission=`; spec 07 reuses it.
    await expect(page).toHaveURL(/[?&]submission=/)
    const submissionUuid = new URL(page.url()).searchParams.get('submission')
    if (submissionUuid) setEnv('E2E_SUBMISSION_UUID', submissionUuid)

    // Exam is auto-graded; release ("Publish grade") it to the learner. The
    // grade save is a server action (no `/api/v2` response to watch), so the
    // outcome is judged from the UI: the queue entry flips to "Released".
    await expect(gradingReviewPage.publishButton).toBeVisible({ timeout: 8000 })
    await expect(gradingReviewPage.publishButton).toBeEnabled({ timeout: 8000 })
    await gradingReviewPage.publishButton.click()

    await expect(gradingReviewPage.submissionItem(learner).getByText(/released|published/i)).toBeVisible({
      timeout: 15_000,
    })
  })
})

// ---------------------------------------------------------------------------
// Phase 4: Student confirms certificate is now available
// ---------------------------------------------------------------------------

import { testAsStudent as studentTest } from '../fixtures'

studentTest.describe.serial('Student – Certificate After Grading', () => {
  // `studentTest`, not `test`: the block must run with the learner's storage state
  studentTest('certificate download button appears after teacher grades all work', async ({ coursePlayerPage }) => {
    const courseUuid = getEnv('E2E_COURSE_UUID') ?? ''
    if (!courseUuid) {
      studentTest.skip(true, 'Course UUID not set')
      return
    }

    // After all required activities are completed and graded, the certificate
    // download should be visible (v2: on the Progress page course card). This
    // is the single source of truth for "course completion".
    await coursePlayerPage.assertCertificateAvailable(courseUuid)
  })
})
