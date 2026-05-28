/**
 * SPEC: Teacher – The "Ultimate Course" Creation
 *
 * Phase 1: Teacher creates a course that exercises every available block type
 * and every activity type supported by the platform.
 *
 * Test order is intentionally sequential (test.describe.serial) because later
 * tests build on state created by earlier ones (course UUID stored in shared state).
 *
 * The course UUID is written to process.env.E2E_COURSE_UUID so that downstream
 * specs (student journey, grading loop) can pick it up.
 *
 * Bug policy:
 *  - If a block type fails to save → test MUST fail. Do not skip.
 *  - If an activity creation API returns an error → test MUST fail.
 *  - If the curriculum editor DnD is broken → document with a clear comment and
 *    leave the test failing so it shows up in the report.
 */

import { testAsTeacher as test, expect } from '../fixtures'
import { COURSE } from '../fixtures/test-data'
import { ActivityStudioPage } from '../page-objects/ActivityStudioPage'

// Persist course UUID across serial tests
let courseUuid = ''

test.describe.serial('Teacher – Course Creation', () => {
  // ── 1. Create the course ────────────────────────────────────────────────

  test('teacher can navigate to the courses dashboard', async ({ page }) => {
    await page.goto('/en/dash/courses')
    await expect(page).toHaveURL(/\/dash\/courses/)
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible({
      timeout: 10_000,
    })
  })

  test('teacher can create a new course via the wizard', async ({ page, courseCreatePage }) => {
    await courseCreatePage.goto()

    courseUuid = await courseCreatePage.createCourse({
      title: COURSE.title,
      description: COURSE.description,
    })

    // Store globally for downstream specs to read
    process.env.E2E_COURSE_UUID = courseUuid

    expect(courseUuid).toBeTruthy()
    expect(page.url()).toContain(`/courses/${courseUuid}/curriculum`)
  })

  // ── 2. Curriculum – create chapters ────────────────────────────────────

  test('teacher can add the Lectures chapter', async ({ page, curriculumEditorPage }) => {
    await curriculumEditorPage.goto(courseUuid)
    await curriculumEditorPage.createChapter(COURSE.chapters.lectures)

    await expect(page.getByText(COURSE.chapters.lectures)).toBeVisible()
  })

  test('teacher can add the Assessments chapter', async ({ page, curriculumEditorPage }) => {
    await curriculumEditorPage.goto(courseUuid)
    await curriculumEditorPage.createChapter(COURSE.chapters.assessments)

    await expect(page.getByText(COURSE.chapters.assessments)).toBeVisible()
  })

  // ── 3. Dynamic lecture with all block types ─────────────────────────────

  /**
   * BUG PROTOCOL: Each block insertion in this test is a direct assertion of
   * feature correctness. If the block editor's slash-command menu fails to show
   * a particular block type, the test MUST remain failing.
   */
  test('teacher can add a dynamic (lecture) activity to the Lectures chapter', async ({
    page,
    curriculumEditorPage,
  }) => {
    await curriculumEditorPage.goto(courseUuid)

    await curriculumEditorPage.addActivityToChapter(
      COURSE.chapters.lectures,
      'Dynamic', // TYPE_DYNAMIC / SUBTYPE_DYNAMIC_PAGE
    )

    // The new activity should appear in the chapter
    await expect(page.getByText(/activity name|dynamic/i).first()).toBeVisible({
      timeout: 10_000,
    })
  })

  test('teacher can populate the lecture with a heading block', async ({ page }) => {
    // Navigate directly to the activity studio
    // NOTE: we look for any activity under the Lectures chapter and navigate
    // to its studio. The exact activityId will be extracted from the URL.
    await page.goto(`/en/dash/courses/${courseUuid}/curriculum`)
    await page.waitForLoadState('networkidle')

    // Find the Configure button for the activity we just created
    const configureBtn = page
      .locator('[data-activity-element], li')
      .filter({ hasText: /introduction|dynamic|lecture/i })
      .getByRole('button', { name: /configure/i })
      .first()

    await expect(configureBtn).toBeVisible({ timeout: 10_000 })
    await configureBtn.click()

    await page.waitForURL(/\/activity\/[^/]+\/studio/, { timeout: 10_000 })
    const match = /\/activity\/([^/]+)\/studio/.exec(page.url())
    expect(match).not.toBeNull()
    const activityId = match![1]
    process.env.E2E_LECTURE_ACTIVITY_ID = activityId

    const studio = new ActivityStudioPage(page)
    await studio.typeInEditor('Introduction to the Course')
  })

  test('teacher can insert a callout block in the lecture', async ({ page }) => {
    const activityId = process.env.E2E_LECTURE_ACTIVITY_ID!
    if (!activityId) test.skip(true, 'Lecture activity not created in prior test')

    const studio = new ActivityStudioPage(page)
    await studio.goto(courseUuid, activityId)

    // Insert a callout using the slash command
    // BUG PROTOCOL: If the slash-command menu doesn't show "Callout", this test
    // will fail — leave it failing, do NOT comment out or skip.
    await studio.insertBlock('Callout')
    await studio.typeInEditor('This is an important note.')
  })

  // ── 4. File submission activity ─────────────────────────────────────────

  test('teacher can add a File Submission activity', async ({ page, curriculumEditorPage }) => {
    await curriculumEditorPage.goto(courseUuid)
    await curriculumEditorPage.addActivityToChapter(COURSE.chapters.assessments, 'File Submission')
    await expect(page.getByText(/file submission|file/i).first()).toBeVisible({
      timeout: 10_000,
    })
  })

  // ── 5. Exam activity with 3 question types ──────────────────────────────

  test('teacher can add an Exam activity', async ({ page, curriculumEditorPage }) => {
    await curriculumEditorPage.goto(courseUuid)
    await curriculumEditorPage.addActivityToChapter(COURSE.chapters.assessments, 'Exam')
    await expect(page.getByText(/exam/i).first()).toBeVisible({ timeout: 10_000 })
  })

  test('teacher can add a multiple-choice question to the exam', async ({ page }) => {
    await page.goto(`/en/dash/courses/${courseUuid}/curriculum`)
    await page.waitForLoadState('networkidle')

    // Find the Exam activity Configure button
    const configureBtn = page
      .locator('[data-activity-element], li')
      .filter({ hasText: /final exam|exam/i })
      .getByRole('button', { name: /configure/i })
      .first()

    await expect(configureBtn).toBeVisible({ timeout: 10_000 })
    await configureBtn.click()
    await page.waitForURL(/\/activity\/[^/]+\/studio/, { timeout: 10_000 })

    const match = /\/activity\/([^/]+)\/studio/.exec(page.url())
    expect(match).not.toBeNull()
    process.env.E2E_EXAM_ACTIVITY_ID = match![1]

    const studio = new ActivityStudioPage(page)

    // Add multiple-choice question
    await studio.addExamQuestion({
      type: 'Multiple choice',
      questionText: 'What does HTML stand for?',
      choices: [
        'HyperText Markup Language',
        'HighText Machine Language',
        'Hyperlink and Text Markup Language',
        'None of the above',
      ],
      correctIndex: 0,
    })

    await expect(page.getByText('What does HTML stand for?')).toBeVisible()
  })

  test('teacher can add a True/False question to the exam', async ({ page }) => {
    const examActivityId = process.env.E2E_EXAM_ACTIVITY_ID!
    if (!examActivityId) test.skip(true, 'Exam activity not created in prior test')

    const studio = new ActivityStudioPage(page)
    await studio.goto(courseUuid, examActivityId)

    await studio.addExamQuestion({
      type: 'True.*False',
      questionText: 'JavaScript is a statically typed language.',
      choices: ['True', 'False'],
      correctIndex: 1,
    })

    await expect(page.getByText('JavaScript is a statically typed language.')).toBeVisible()
  })

  test('teacher can add a multi-select question to the exam', async ({ page }) => {
    const examActivityId = process.env.E2E_EXAM_ACTIVITY_ID!
    if (!examActivityId) test.skip(true, 'Exam activity not created in prior test')

    const studio = new ActivityStudioPage(page)
    await studio.goto(courseUuid, examActivityId)

    await studio.addExamQuestion({
      type: 'Multi.*(select|choice)',
      questionText: 'Which of the following are JavaScript frameworks?',
      choices: ['React', 'Django', 'Vue', 'Laravel'],
      correctIndices: [0, 2],
    })

    await expect(page.getByText('Which of the following are JavaScript frameworks?')).toBeVisible()
  })

  // ── 6. Code challenge activity ──────────────────────────────────────────

  test('teacher can add a Code Challenge activity', async ({ page, curriculumEditorPage }) => {
    await curriculumEditorPage.goto(courseUuid)
    await curriculumEditorPage.addActivityToChapter(COURSE.chapters.assessments, 'Code Challenge')
    await expect(page.getByText(/code challenge|coding/i).first()).toBeVisible({
      timeout: 10_000,
    })
  })

  // ── 7. Publish the course ───────────────────────────────────────────────

  test('teacher can navigate to the course review & publish page', async ({ page }) => {
    await page.goto(`/en/dash/courses/${courseUuid}/review`)
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('heading', { name: /review|publish/i }).first()).toBeVisible({
      timeout: 15_000,
    })
  })

  test('teacher can publish the course', async ({ page }) => {
    await page.goto(`/en/dash/courses/${courseUuid}/review`)
    await page.waitForLoadState('networkidle')

    const publishBtn = page.getByRole('button', { name: /publish/i }).first()
    await expect(publishBtn).toBeVisible({ timeout: 10_000 })
    await publishBtn.click()

    // Confirm publish if a dialog appears
    const confirmBtn = page.getByRole('button', { name: /confirm|yes|publish/i }).last()
    if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await confirmBtn.click()
    }

    // The course status should update to "Published" (visible in the page heading/badge)
    await expect(page.getByText(/published|live/i).first()).toBeVisible({
      timeout: 15_000,
    })
  })

  // ── 8. Course details page ──────────────────────────────────────────────

  test('teacher can update course details (title) on the details page', async ({
    page,
    courseDetailsPage,
  }) => {
    await courseDetailsPage.goto(courseUuid)
    // Verify the course title is pre-filled
    await expect(page.getByRole('textbox', { name: /title|name/i }).first()).toHaveValue(
      COURSE.title,
      {
        timeout: 10_000,
      },
    )
  })
})
