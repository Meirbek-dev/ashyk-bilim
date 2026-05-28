/**
 * Custom Playwright fixtures.
 *
 * Exports an extended `test` and `expect` that inject typed Page Object
 * instances into every test and automatically select the correct storage
 * state (admin / teacher / student) based on the project name or explicit
 * fixture usage.
 */

import { test as base, expect } from '@playwright/test'
import { STORAGE_STATE } from '../auth-states'
import { LoginPage } from '../page-objects/LoginPage'
import { SignupPage } from '../page-objects/SignupPage'
import { NavBar } from '../page-objects/NavBar'
import { DashCoursesPage } from '../page-objects/DashCoursesPage'
import { CourseCreatePage } from '../page-objects/CourseCreatePage'
import { CurriculumEditorPage } from '../page-objects/CurriculumEditorPage'
import { CourseDetailsPage } from '../page-objects/CourseDetailsPage'
import { CoursePlayerPage } from '../page-objects/CoursePlayerPage'
import { AssessmentPage } from '../page-objects/AssessmentPage'
import { GradebookPage } from '../page-objects/GradebookPage'
import { GradingReviewPage } from '../page-objects/GradingReviewPage'
import { AdminUsersPage } from '../page-objects/AdminUsersPage'
import { FileSubmissionPage } from '../page-objects/FileSubmissionPage'

// ---------------------------------------------------------------------------
// Type declarations
// ---------------------------------------------------------------------------

interface LmsFixtures {
  loginPage: LoginPage
  signupPage: SignupPage
  navBar: NavBar
  dashCoursesPage: DashCoursesPage
  courseCreatePage: CourseCreatePage
  curriculumEditorPage: CurriculumEditorPage
  courseDetailsPage: CourseDetailsPage
  coursePlayerPage: CoursePlayerPage
  assessmentPage: AssessmentPage
  gradebookPage: GradebookPage
  gradingReviewPage: GradingReviewPage
  adminUsersPage: AdminUsersPage
  fileSubmissionPage: FileSubmissionPage
}

// ---------------------------------------------------------------------------
// Base fixture — injects page objects
// ---------------------------------------------------------------------------

export const test = base.extend<LmsFixtures>({
  loginPage: async ({ page }, use) => use(new LoginPage(page)),
  signupPage: async ({ page }, use) => use(new SignupPage(page)),
  navBar: async ({ page }, use) => use(new NavBar(page)),
  dashCoursesPage: async ({ page }, use) => use(new DashCoursesPage(page)),
  courseCreatePage: async ({ page }, use) => use(new CourseCreatePage(page)),
  curriculumEditorPage: async ({ page }, use) => use(new CurriculumEditorPage(page)),
  courseDetailsPage: async ({ page }, use) => use(new CourseDetailsPage(page)),
  coursePlayerPage: async ({ page }, use) => use(new CoursePlayerPage(page)),
  assessmentPage: async ({ page }, use) => use(new AssessmentPage(page)),
  gradebookPage: async ({ page }, use) => use(new GradebookPage(page)),
  gradingReviewPage: async ({ page }, use) => use(new GradingReviewPage(page)),
  adminUsersPage: async ({ page }, use) => use(new AdminUsersPage(page)),
  fileSubmissionPage: async ({ page }, use) => use(new FileSubmissionPage(page)),
})

// ---------------------------------------------------------------------------
// Role-specific storage state fixtures
// ---------------------------------------------------------------------------

/** Playwright `test` pre-authenticated as Admin. */
export const testAsAdmin = test.extend<{ storageState: string }>({
  storageState: async ({}, use) => {
    await use(STORAGE_STATE.admin)
  },
})

/** Playwright `test` pre-authenticated as Teacher. */
export const testAsTeacher = test.extend<{ storageState: string }>({
  storageState: async ({}, use) => {
    await use(STORAGE_STATE.teacher)
  },
})

/** Playwright `test` pre-authenticated as Student. */
export const testAsStudent = test.extend<{ storageState: string }>({
  storageState: async ({}, use) => {
    await use(STORAGE_STATE.student)
  },
})

export { expect }
