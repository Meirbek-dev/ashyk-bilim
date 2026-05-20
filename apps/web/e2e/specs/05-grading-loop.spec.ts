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

import { testAsTeacher as test, expect } from '../fixtures';
import { USERS } from '../fixtures/test-data';

test.describe.serial('Teacher – Grading Loop', () => {
  let courseUuid: string;
  let fileSubmissionActivityId: string;
  let examActivityId: string;

  test.beforeAll(async () => {
    courseUuid = process.env.E2E_COURSE_UUID ?? '';
    fileSubmissionActivityId = process.env.E2E_FILE_SUBMISSION_ACTIVITY_ID ?? '';
    examActivityId = process.env.E2E_EXAM_ACTIVITY_ID ?? '';

    if (!courseUuid) {
      throw new Error('E2E_COURSE_UUID not set. Run spec 03 (course creation) first.');
    }
  });

  // ── 1. Gradebook ─────────────────────────────────────────────────────────

  test('teacher can navigate to the course gradebook', async ({ page, gradebookPage }) => {
    await gradebookPage.goto(courseUuid);
    await expect(page.getByRole('heading', { name: /gradebook|grades/i }).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test('gradebook shows the student submission that needs grading', async ({ page, gradebookPage }) => {
    await gradebookPage.goto(courseUuid);

    // The student's name or email should appear somewhere in the table
    await expect(page.getByText(new RegExp(USERS.student.email.split('@')[0]!, 'i')).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  // ── 2. Grade file submission ──────────────────────────────────────────────

  /**
   * BUG PROTOCOL: If the submission list on the review page is empty despite the
   * student having submitted, this is a bug. The test MUST fail — do not skip.
   */
  test('teacher can open the file submission review page', async ({ page, gradebookPage }) => {
    if (!fileSubmissionActivityId) {
      test.skip(true, 'File submission activity ID not captured — run student journey first');
    }
    await gradebookPage.gotoActivityReview(courseUuid, fileSubmissionActivityId);

    // The submission list should show at least one submission
    await expect(
      page
        .locator('[data-submission-item], .submission-item, [role="listitem"], li')
        .filter({ hasText: new RegExp(USERS.student.firstName, 'i') })
        .first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('teacher can select the student submission and see the uploaded file', async ({ page, gradingReviewPage }) => {
    if (!fileSubmissionActivityId) {
      test.skip(true, 'File submission activity ID not captured — run student journey first');
    }
    await gradingReviewPage.goto(courseUuid, fileSubmissionActivityId);

    await gradingReviewPage.selectSubmission(USERS.student.firstName);

    // The uploaded file name should be visible in the inspector pane
    await expect(page.getByText(/sample\.pdf|\.pdf/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test('teacher can assign a score and feedback to the file submission', async ({ page, gradingReviewPage }) => {
    if (!fileSubmissionActivityId) {
      test.skip(true, 'File submission activity ID not captured — run student journey first');
    }
    await gradingReviewPage.goto(courseUuid, fileSubmissionActivityId);
    await gradingReviewPage.selectSubmission(USERS.student.firstName);

    await gradingReviewPage.gradeSubmission({
      score: 85,
      feedback: 'Good work! The submission meets all requirements.',
    });
  });

  test('file submission status updates to Graded after teacher review', async ({ page, gradingReviewPage }) => {
    if (!fileSubmissionActivityId) {
      test.skip(true, 'File submission activity ID not captured — run student journey first');
    }
    await gradingReviewPage.goto(courseUuid, fileSubmissionActivityId);
    await gradingReviewPage.selectSubmission(USERS.student.firstName);
    await gradingReviewPage.assertGradedStatus();
  });

  // ── 3. Grade the exam submission ──────────────────────────────────────────

  test('teacher can navigate to the exam review page via gradebook', async ({ page, gradebookPage }) => {
    if (!examActivityId) {
      test.skip(true, 'Exam activity ID not set — run course creation spec first');
    }
    await gradebookPage.gotoActivityReview(courseUuid, examActivityId);
    await expect(page.url()).toContain(`/activity/${examActivityId}/review`);
  });

  test('teacher can release the exam grade to the student', async ({ page, gradingReviewPage }) => {
    if (!examActivityId) {
      test.skip(true, 'Exam activity ID not set — run course creation spec first');
    }
    await gradingReviewPage.goto(courseUuid, examActivityId);

    // If there's a student submission, select it
    const submissionItem = page
      .locator('[data-submission-item], .submission-item, [role="listitem"], li')
      .filter({ hasText: new RegExp(USERS.student.firstName, 'i') })
      .first();

    if (await submissionItem.isVisible({ timeout: 10_000 }).catch(() => false)) {
      await submissionItem.click();
      // Exam may be auto-graded; just publish/release the grade
      const releaseBtn = page.getByRole('button', { name: /publish|release|approve/i }).first();
      await expect(releaseBtn).toBeVisible({ timeout: 8_000 });
      await releaseBtn.click();

      await expect(
        page
          .locator('[data-sonner-toast]')
          .first()
          .or(page.getByText(/released|published|graded/i).first()),
      ).toBeVisible({ timeout: 10_000 });
    } else {
      // BUG: No student submission found despite student completing the exam
      await expect(submissionItem).toBeVisible({ timeout: 1 }); // intentional fail
    }
  });
});

// ---------------------------------------------------------------------------
// Phase 4: Student confirms certificate is now available
// ---------------------------------------------------------------------------

import { testAsStudent as studentTest } from '../fixtures';

studentTest.describe.serial('Student – Certificate After Grading', () => {
  test('certificate download button appears after teacher grades all work', async ({ page, coursePlayerPage }) => {
    const courseUuid = process.env.E2E_COURSE_UUID ?? '';
    if (!courseUuid) test.skip(true, 'Course UUID not set');

    await coursePlayerPage.gotoCourseLanding(courseUuid);

    // After all required activities are completed and graded, the certificate
    // download should be visible. This is the single source of truth for
    // "course completion".
    await coursePlayerPage.assertCertificateAvailable();
  });
});
