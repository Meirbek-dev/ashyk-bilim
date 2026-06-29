import type { Page, Locator } from '@playwright/test'

/**
 * Page Object for /en/dash/courses — the teacher's course list.
 */
export class DashCoursesPage {
  public readonly page: Page

  public readonly newCourseButton: Locator
  public readonly courseCards: Locator
  public readonly searchInput: Locator

  public constructor(page: Page) {
    this.page = page
    // "New course" / "Create" button in the top-right
    this.newCourseButton = page
      .getByRole('link', { name: /new course|create course/i })
      .or(page.getByRole('button', { name: /new course|create course/i }))
      .first()
    this.courseCards = page.locator('[data-course-card], article, .course-card').first()
    this.searchInput = page.getByRole('searchbox')
  }

  public async goto(): Promise<void> {
    await this.page.goto('/en/dash/courses')
    await this.page.waitForLoadState('networkidle')
  }

  public async clickNewCourse(): Promise<void> {
    await this.newCourseButton.click()
    await this.page.waitForURL(/\/courses\/new/, { timeout: 10_000 })
  }

  /** Navigate directly to a specific course workspace page */
  public async gotoCoursePage(courseUuid: string, stage = 'details'): Promise<void> {
    await this.page.goto(`/en/dash/courses/${courseUuid}/${stage}`)
    await this.page.waitForLoadState('networkidle')
  }
}
