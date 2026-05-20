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

import { testAsStudent as test, expect } from '../fixtures';
import { COURSE, CORRECT_PYTHON_SOLUTION, SAMPLE_PDF } from '../fixtures/test-data';
import { ensureFixtureFiles } from '../utils/fixtures';

test.describe.serial('Student – Learning Journey', () => {
  let courseUuid: string;

  test.beforeAll(async () => {
    courseUuid = process.env.E2E_COURSE_UUID ?? '';
    if (!courseUuid) {
      throw new Error('E2E_COURSE_UUID not set. Run the course-creation spec first, or set it manually.');
    }
    ensureFixtureFiles();
  });

  // ── 1. Enroll ───────────────────────────────────────────────────────────

  test('student can navigate to the course landing page', async ({ page }) => {
    await page.goto(`/en/course/${courseUuid}`);
    await page.waitForLoadState('networkidle');

    // Course title or content must be visible
    await expect(page.getByText(COURSE.title)).toBeVisible({ timeout: 15_000 });
  });

  test('student can enroll in the course', async ({ page, coursePlayerPage }) => {
    await coursePlayerPage.gotoCourseLanding(courseUuid);

    // If an Enroll button exists, click it
    if (await coursePlayerPage.enrollButton.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await coursePlayerPage.enroll();
    }

    // After enroll, the course content / activity list should be accessible
    await expect(page.locator('nav, aside, [aria-label*="activities"]').first()).toBeVisible({ timeout: 10_000 });
  });

  // ── 2. Complete the lecture activity ────────────────────────────────────

  test('student can open the Introduction Lecture activity', async ({ page, coursePlayerPage }) => {
    await coursePlayerPage.gotoCourseLanding(courseUuid);

    // Find the lecture in the sidebar and click it
    const lectureLink = page
      .locator('nav a, aside a, [role="link"]')
      .filter({ hasText: /introduction|lecture/i })
      .first();

    await expect(lectureLink).toBeVisible({ timeout: 10_000 });
    await lectureLink.click();
    await page.waitForURL(/\/activity\//, { timeout: 10_000 });
  });

  test('student can mark the lecture activity as complete', async ({ page, coursePlayerPage }) => {
    // Navigate to the first activity in the course
    await page.goto(`/en/course/${courseUuid}`);
    await page.waitForLoadState('networkidle');

    const firstActivityLink = page
      .locator('nav a, aside a, [role="link"]')
      .filter({ hasText: /introduction|lecture|dynamic/i })
      .first();

    if (await firstActivityLink.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await firstActivityLink.click();
      await page.waitForURL(/\/activity\//, { timeout: 10_000 });
    }

    // The "Mark as complete" button should be visible
    await expect(coursePlayerPage.markCompleteButton).toBeVisible({ timeout: 10_000 });
    await coursePlayerPage.markComplete();

    // A visual indication of completion should appear (checkmark, "Completed" text, etc.)
    await expect(page.getByText(/completed|done|marked/i).first()).toBeVisible({ timeout: 10_000 });
  });

  // ── 3. File submission ──────────────────────────────────────────────────

  test('student can navigate to the File Submission activity', async ({ page }) => {
    await page.goto(`/en/course/${courseUuid}`);
    await page.waitForLoadState('networkidle');

    const fileSubmissionLink = page
      .locator('nav a, aside a, [role="link"]')
      .filter({ hasText: /file|project|upload/i })
      .first();

    await expect(fileSubmissionLink).toBeVisible({ timeout: 10_000 });
    await fileSubmissionLink.click();
    await page.waitForURL(/\/activity\//, { timeout: 10_000 });

    // Store the activity id for grading spec
    const match = page.url().match(/\/activity\/([^/]+)/);
    if (match) process.env.E2E_FILE_SUBMISSION_ACTIVITY_ID = match[1];
  });

  /**
   * BUG PROTOCOL: If the file upload input is not rendered or the submission
   * POST fails, this test MUST remain failing. The feature is broken.
   */
  test('student can upload a PDF and submit the file submission activity', async ({ page, fileSubmissionPage }) => {
    const activityId = process.env.E2E_FILE_SUBMISSION_ACTIVITY_ID;
    if (!activityId) test.skip(true, 'File submission activity ID not captured in prior test');

    await page.goto(`/en/course/${courseUuid}/activity/${activityId}`);
    await page.waitForLoadState('networkidle');

    await fileSubmissionPage.uploadAndSubmit(SAMPLE_PDF);
    await fileSubmissionPage.assertSubmitted();
  });

  // ── 4. Exam ─────────────────────────────────────────────────────────────

  test('student can navigate to the Final Exam activity', async ({ page }) => {
    await page.goto(`/en/course/${courseUuid}`);
    await page.waitForLoadState('networkidle');

    const examLink = page
      .locator('nav a, aside a, [role="link"]')
      .filter({ hasText: /exam|quiz/i })
      .first();

    await expect(examLink).toBeVisible({ timeout: 10_000 });
    await examLink.click();
    await page.waitForURL(/\/activity\//, { timeout: 10_000 });

    const match = page.url().match(/\/activity\/([^/]+)/);
    if (match) process.env.E2E_EXAM_STUDENT_ACTIVITY_ID = match[1];
  });

  /**
   * BUG PROTOCOL: The exam start button must be visible and clickable.
   * If the assessment shell fails to render, the test MUST fail.
   */
  test('student can start an exam attempt', async ({ page, assessmentPage }) => {
    const activityId = process.env.E2E_EXAM_STUDENT_ACTIVITY_ID;
    if (!activityId) test.skip(true, 'Exam activity ID not captured in prior test');

    await page.goto(`/en/course/${courseUuid}/activity/${activityId}`);
    await page.waitForLoadState('networkidle');

    await expect(assessmentPage.startButton).toBeVisible({ timeout: 10_000 });
    await assessmentPage.startAttempt();

    // After starting, question content must be visible
    await expect(page.locator('[data-question], .question-block, fieldset').first()).toBeVisible({ timeout: 10_000 });
  });

  test('student can answer exam questions and submit', async ({ page, assessmentPage }) => {
    const activityId = process.env.E2E_EXAM_STUDENT_ACTIVITY_ID;
    if (!activityId) test.skip(true, 'Exam activity ID not captured in prior test');

    await page.goto(`/en/course/${courseUuid}/activity/${activityId}`);
    await page.waitForLoadState('networkidle');

    // Start attempt if not already in progress
    if (await assessmentPage.startButton.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await assessmentPage.startAttempt();
    }

    // Answer question 1 – Multiple choice (correct answer is index 0)
    await assessmentPage.answerChoiceQuestion(0, 0);

    // Answer question 2 – True/False (correct answer is False = index 1)
    await assessmentPage.answerChoiceQuestion(1, 1);

    // Answer question 3 – Multi-select (correct: 0 and 2)
    await assessmentPage.answerMultiSelectQuestion(2, [0, 2]);

    // Submit the exam
    await assessmentPage.submitAttempt();

    // A result / score should be displayed after submission
    await expect(page.getByText(/score|result|passed|completed/i).first()).toBeVisible({ timeout: 15_000 });
  });

  // ── 5. Code challenge ───────────────────────────────────────────────────

  test('student can navigate to and submit the coding challenge', async ({ page, assessmentPage }) => {
    await page.goto(`/en/course/${courseUuid}`);
    await page.waitForLoadState('networkidle');

    const codeLink = page
      .locator('nav a, aside a, [role="link"]')
      .filter({ hasText: /code|coding|challenge/i })
      .first();

    if (!(await codeLink.isVisible({ timeout: 5_000 }).catch(() => false))) {
      // BUG: Code challenge activity not visible in sidebar — leave test failing
      await expect(codeLink).toBeVisible({
        timeout: 1,
      }); // will throw
    }

    await codeLink.click();
    await page.waitForURL(/\/activity\//, { timeout: 10_000 });

    const match = page.url().match(/\/activity\/([^/]+)/);
    if (match) process.env.E2E_CODE_ACTIVITY_ID = match[1];

    // Fill and submit the code solution
    if (await assessmentPage.codeEditor.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await assessmentPage.fillCodeEditor(CORRECT_PYTHON_SOLUTION);
      await assessmentPage.submitCode();

      // Wait for evaluation result
      await expect(page.getByText(/passed|correct|submitted/i).first()).toBeVisible({ timeout: 30_000 });
    } else {
      // BUG PROTOCOL: Code editor not visible — test must fail
      await expect(assessmentPage.codeEditor).toBeVisible({ timeout: 1 });
    }
  });

  // ── 6. Certificate check ────────────────────────────────────────────────

  /**
   * Certificate should NOT be available before the teacher grades the submission.
   * This test documents the expected (correct) state.
   */
  test('certificate is not yet available before teacher grades work', async ({ page, coursePlayerPage }) => {
    await coursePlayerPage.gotoCourseLanding(courseUuid);

    // The download certificate button should NOT be present yet
    const certBtn = coursePlayerPage.downloadCertButton;
    await expect(certBtn).not.toBeVisible({ timeout: 5_000 });
  });
});
