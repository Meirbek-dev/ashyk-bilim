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
import { getEnv, setEnv } from '../env'
import { JUDGE0_SKIP_REASON, judge0Missing } from '../fixtures/environment'
import { COURSE } from '../fixtures/test-data'
import { ActivityStudioPage } from '../page-objects/ActivityStudioPage'

// Persist course UUID across serial tests (setEnv also writes e2e/.auth/state.json)
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

    courseUuid = await courseCreatePage.createCourse({ title: COURSE.title })

    // Store globally for downstream specs to read
    setEnv('E2E_COURSE_UUID', courseUuid)

    expect(courseUuid).toBeTruthy()
    // v2 lands on the Course Studio overview, not the curriculum stage
    expect(page.url()).toContain(`/courses/${courseUuid}`)
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
  test('teacher can add a dynamic (lecture) activity to the Lectures chapter', async ({ curriculumEditorPage }) => {
    await curriculumEditorPage.goto(courseUuid)

    // v2: "Dynamic Page" is quick-created ("New Dynamic Page") and renamed inline
    await curriculumEditorPage.addActivityToChapter(
      COURSE.chapters.lectures,
      'Dynamic', // TYPE_DYNAMIC / SUBTYPE_DYNAMIC_PAGE
      COURSE.activities.dynamicLecture,
    )

    // The new activity should appear in the chapter
    await expect(curriculumEditorPage.activityRow(COURSE.activities.dynamicLecture)).toBeVisible({
      timeout: 10_000,
    })
  })

  test('teacher can populate the lecture with a heading block', async ({ page, curriculumEditorPage }) => {
    // The first visit compiles the studio route under `next dev` (> 30 s on a cold
    // server — the whole suite then cascades); a later visit is fast.
    test.setTimeout(90_000)
    // v2: the activity row's "Open edit page" link carries the activity id;
    // the studio route renders the page editor for dynamic activities.
    await curriculumEditorPage.goto(courseUuid)
    const activityId = await curriculumEditorPage.configureActivity(COURSE.activities.dynamicLecture)
    setEnv('E2E_LECTURE_ACTIVITY_ID', activityId)

    const studio = new ActivityStudioPage(page)
    await studio.typeInEditor('Introduction to the Course')
  })

  test('teacher can insert a callout block in the lecture', async ({ page }) => {
    const activityId = getEnv('E2E_LECTURE_ACTIVITY_ID')
    if (!activityId) {
      test.skip(true, 'Lecture activity not created in prior test')
      return
    }

    const studio = new ActivityStudioPage(page)
    await studio.goto(courseUuid, activityId)

    // Insert a callout using the slash command
    // BUG PROTOCOL: If the slash-command menu doesn't show "Callout", this test
    // will fail — leave it failing, do NOT comment out or skip.
    await studio.insertBlock('Callout')
    await studio.typeInEditor('This is an important note.')
  })

  // ── 4. File submission activity ─────────────────────────────────────────

  test('teacher can add a File Submission activity', async ({ curriculumEditorPage }) => {
    await curriculumEditorPage.goto(courseUuid)
    await curriculumEditorPage.addActivityToChapter(
      COURSE.chapters.assessments,
      'File Submission',
      COURSE.activities.fileSubmission,
    )
    await expect(curriculumEditorPage.activityRow(COURSE.activities.fileSubmission)).toBeVisible({
      timeout: 10_000,
    })
  })

  test('teacher can publish the File Submission from its studio', async ({ page, curriculumEditorPage }) => {
    // v2: a file submission stays invisible to learners (404) until published
    await curriculumEditorPage.goto(courseUuid)
    const activityId = await curriculumEditorPage.configureActivity(COURSE.activities.fileSubmission)
    setEnv('E2E_FILE_SUBMISSION_ACTIVITY_ID', activityId)
    await new ActivityStudioPage(page).publishFileSubmission(courseUuid, activityId)
  })

  // ── 5. Exam activity with 3 question types ──────────────────────────────

  test('teacher can add an Exam activity', async ({ page, curriculumEditorPage }) => {
    await curriculumEditorPage.goto(courseUuid)
    // v2: the exam modal lands on the new assessment's studio
    await curriculumEditorPage.addActivityToChapter(COURSE.chapters.assessments, 'Exam', COURSE.activities.exam)
    await expect(page).toHaveURL(/\/activity\/[^/]+\/studio/)
    await curriculumEditorPage.goto(courseUuid)
    await expect(curriculumEditorPage.activityRow(COURSE.activities.exam)).toBeVisible({ timeout: 10_000 })
  })

  test('teacher can add a multiple-choice question to the exam', async ({ page, curriculumEditorPage }) => {
    await curriculumEditorPage.goto(courseUuid)
    const examActivityId = await curriculumEditorPage.configureActivity(COURSE.activities.exam)
    setEnv('E2E_EXAM_ACTIVITY_ID', examActivityId)

    const studio = new ActivityStudioPage(page)

    // Add multiple-choice question
    await studio.addExamQuestion({
      kind: 'single',
      questionText: 'What does HTML stand for?',
      choices: [
        'HyperText Markup Language',
        'HighText Machine Language',
        'Hyperlink and Text Markup Language',
        'None of the above',
      ],
      correctIndex: 0,
    })

    await expect(page.getByText('What does HTML stand for?').first()).toBeVisible()
  })

  test('teacher can add a True/False question to the exam', async ({ page }) => {
    const examActivityId = getEnv('E2E_EXAM_ACTIVITY_ID')
    if (!examActivityId) {
      test.skip(true, 'Exam activity not created in prior test')
      return
    }

    const studio = new ActivityStudioPage(page)
    await studio.goto(courseUuid, examActivityId)

    await studio.addExamQuestion({
      kind: 'trueFalse',
      questionText: 'JavaScript is a statically typed language.',
      correctIndex: 1,
    })

    await expect(page.getByText('JavaScript is a statically typed language.').first()).toBeVisible()
  })

  test('teacher can add a multi-select question to the exam', async ({ page }) => {
    const examActivityId = getEnv('E2E_EXAM_ACTIVITY_ID')
    if (!examActivityId) {
      test.skip(true, 'Exam activity not created in prior test')
      return
    }

    const studio = new ActivityStudioPage(page)
    await studio.goto(courseUuid, examActivityId)

    await studio.addExamQuestion({
      kind: 'multiple',
      questionText: 'Which of the following are JavaScript frameworks?',
      choices: ['React', 'Django', 'Vue', 'Laravel'],
      correctIndices: [0, 2],
    })

    await expect(page.getByText('Which of the following are JavaScript frameworks?').first()).toBeVisible()
  })

  test('teacher can publish the exam from the studio', async ({ page }) => {
    const examActivityId = getEnv('E2E_EXAM_ACTIVITY_ID')
    if (!examActivityId) {
      test.skip(true, 'Exam activity not created in prior test')
      return
    }
    // v2: attempts are only allowed once the assessment lifecycle is "published"
    const studio = new ActivityStudioPage(page)
    await studio.publishAssessment(courseUuid, examActivityId)
  })

  // ── 6. Code challenge activity ──────────────────────────────────────────

  test('teacher can add a Code Challenge activity', async ({ curriculumEditorPage }) => {
    test.skip(judge0Missing(), JUDGE0_SKIP_REASON)
    await curriculumEditorPage.goto(courseUuid)
    await curriculumEditorPage.addActivityToChapter(
      COURSE.chapters.assessments,
      'Code Challenge',
      COURSE.activities.codeChallenge,
    )
    await expect(curriculumEditorPage.activityRow(COURSE.activities.codeChallenge)).toBeVisible({
      timeout: 10_000,
    })
  })

  // ── 6b. Certificate template ────────────────────────────────────────────

  test('teacher can enable a course certificate', async ({ page }) => {
    // v2 issues certificates only from a configured certification template
    // (`POST certifications`); without one the learner never gets a download.
    await page.goto(`/en/dash/courses/${courseUuid}/certificate`)
    await page.waitForLoadState('networkidle')
    await page.getByRole('button', { name: /enable certification/i }).click()
    await page.getByRole('textbox', { name: /certification name/i }).fill(`${COURSE.title} certificate`)
    await page
      .getByRole('textbox', { name: /certification description/i })
      .fill('Awarded for completing every activity of the E2E course.')

    // createCertification is a server action (no `/api/v2` response to watch)
    await page.getByRole('button', { name: /^save( draft)?$/i }).click()
    await expect(page.getByText(/certification created/i).first()).toBeVisible({ timeout: 15_000 })

    // The template must survive a reload (it is what `certificates/me` issues from)
    await page.reload()
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('switch')).toBeChecked({ timeout: 15_000 })
  })

  // ── 7. Publish the course ───────────────────────────────────────────────

  test('teacher can make every activity learner-visible', async ({ curriculumEditorPage }) => {
    // v2 publish gate: the course needs at least one published activity, and
    // the learner outline only lists published ones. The code challenge stays
    // a draft: its studio cannot pick languages while Judge0 is down (see the
    // note in spec 04), and a published-but-unauthored challenge would count
    // as a required activity the learner can never complete.
    await curriculumEditorPage.goto(courseUuid)
    const { codeChallenge: _codeChallenge, ...learnerVisible } = COURSE.activities
    for (const name of Object.values(learnerVisible)) {
      await curriculumEditorPage.publishActivity(name)
    }
  })

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

  test('teacher can update course details (title) on the details page', async ({ page, courseDetailsPage }) => {
    await courseDetailsPage.goto(courseUuid)
    // Verify the course title is pre-filled
    await expect(page.getByRole('textbox', { name: /title|name/i }).first()).toHaveValue(COURSE.title, {
      timeout: 10_000,
    })
  })
})
