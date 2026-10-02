/**
 * SPEC: Course archiving (COURSE_ARCHIVING.md section 11, web)
 *
 *  - Teacher archives the course from the «Publish» tab
 *  - The course leaves the public catalog
 *  - Student still sees it on the trail («Archived»), opens their exam result,
 *    and cannot hand anything in
 *  - Teacher restores the course; it is back in the catalog
 *
 * Prerequisites: specs 03-05 ran (course published, student enrolled with an
 * exam attempt). Course and exam ids come from the shared e2e state.
 *
 * Bug policy: If any step fails due to application bugs, the test MUST remain
 * failing. Never lower assertions or add workarounds to hide failures.
 */

import { expect, test } from '../fixtures'
import { STORAGE_STATE } from '../auth-states'
import { getEnv } from '../env'
import { COURSE } from '../fixtures/test-data'
import { CoursePlayerPage } from '../page-objects/CoursePlayerPage'
import type { Browser, Page } from '@playwright/test'

const TIMEOUT = 15_000

async function openAs(browser: Browser, role: keyof typeof STORAGE_STATE): Promise<Page> {
  const context = await browser.newContext({ storageState: STORAGE_STATE[role] })
  return context.newPage()
}

async function expectInCatalog(page: Page, present: boolean): Promise<void> {
  await page.goto('/en/courses')
  await page.waitForLoadState('networkidle')
  const card = page.getByRole('article', { name: COURSE.title })
  if (present) await expect(card).toBeVisible({ timeout: TIMEOUT })
  else await expect(card).toHaveCount(0)
}

/** Click the lifecycle button on the course's «Publish» tab and confirm the dialog. */
async function runLifecycle(page: Page, courseUuid: string, action: 'Archive' | 'Restore'): Promise<void> {
  await page.goto(`/en/dash/courses/${courseUuid}/review`)
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: action, exact: true }).click()
  const dialog = page.getByRole('alertdialog')
  await expect(dialog).toBeVisible({ timeout: TIMEOUT })
  const done = page.waitForResponse(
    r => r.request().method() === 'POST' && /\/courses\/[^/]+\/lifecycle$/u.test(r.url()),
    { timeout: TIMEOUT },
  )
  await dialog.getByRole('button', { name: action, exact: true }).click()
  const response = await done
  expect(response.ok(), `${action} -> ${response.status()} ${await response.text()}`).toBe(true)
}

test.describe.serial('Course archiving', () => {
  let courseUuid: string
  let examActivityId: string

  test.beforeAll(() => {
    courseUuid = getEnv('E2E_COURSE_UUID') ?? ''
    examActivityId = getEnv('E2E_EXAM_ACTIVITY_ID') ?? ''
    if (!courseUuid || !examActivityId) {
      throw new Error('E2E_COURSE_UUID / E2E_EXAM_ACTIVITY_ID not set. Run specs 03-05 first.')
    }
  })

  test('teacher archives the course and it leaves the catalog', async ({ browser }) => {
    const teacher = await openAs(browser, 'teacher')
    await expectInCatalog(teacher, true)
    await runLifecycle(teacher, courseUuid, 'Archive')
    // The workspace banner says so and offers the way back.
    await expect(teacher.getByText(/archived since/i)).toBeVisible({ timeout: TIMEOUT })
    await expect(teacher.getByRole('button', { name: 'Restore', exact: true }).first()).toBeVisible()
    await expectInCatalog(teacher, false)
    await teacher.context().close()
  })

  test('student keeps the course on the trail, reads the result, cannot hand in', async ({ browser }) => {
    const student = await openAs(browser, 'student')
    const player = new CoursePlayerPage(student)
    await player.gotoTrail()
    const card = player.trailCourseCard(courseUuid)
    await expect(card).toBeVisible({ timeout: TIMEOUT })
    await expect(card.getByText(/archived/i)).toBeVisible()
    await expect(card.getByRole('button', { name: /leave|quit/i })).toHaveCount(0)

    // The landing is readable and says enrolment is closed.
    await player.gotoCourseLanding(courseUuid)
    await expect(student.getByText(/this course is archived/i)).toBeVisible({ timeout: TIMEOUT })
    await expect(student.getByRole('button', { name: /start course/i })).toHaveCount(0)

    // The exam page shows the past result; nothing can be started or submitted.
    await player.gotoActivity(courseUuid, examActivityId)
    await expect(student.getByText(/the course is archived/i).first()).toBeVisible({ timeout: TIMEOUT })
    await expect(student.getByRole('button', { name: /^(start|submit|retry|continue)/i })).toHaveCount(0)
    await student.context().close()
  })

  test('teacher restores the course and it is back in the catalog', async ({ browser }) => {
    const teacher = await openAs(browser, 'teacher')
    await runLifecycle(teacher, courseUuid, 'Restore')
    await expect(teacher.getByText(/archived since/i)).toHaveCount(0)
    await expectInCatalog(teacher, true)
    await teacher.context().close()
  })
})
