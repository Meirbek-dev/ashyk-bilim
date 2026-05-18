import type { Page, Locator } from '@playwright/test';

/**
 * Page Object for /en/dash/courses — the teacher's course list.
 */
export class DashCoursesPage {
  readonly page: Page;

  readonly newCourseButton: Locator;
  readonly courseCards: Locator;
  readonly searchInput: Locator;

  constructor(page: Page) {
    this.page = page;
    // "New course" / "Create" button in the top-right
    this.newCourseButton = page
      .getByRole('link', { name: /new course|create course/i })
      .or(page.getByRole('button', { name: /new course|create course/i }))
      .first();
    this.courseCards = page.locator('[data-course-card], article, .course-card').first();
    this.searchInput = page.getByRole('searchbox');
  }

  async goto(): Promise<void> {
    await this.page.goto('/en/dash/courses');
    await this.page.waitForLoadState('networkidle');
  }

  async clickNewCourse(): Promise<void> {
    await this.newCourseButton.click();
    await this.page.waitForURL(/\/courses\/new/, { timeout: 10_000 });
  }

  /** Navigate directly to a specific course workspace page */
  async gotoCoursePage(courseUuid: string, stage: string = 'details'): Promise<void> {
    await this.page.goto(`/en/dash/courses/${courseUuid}/${stage}`);
    await this.page.waitForLoadState('networkidle');
  }
}
