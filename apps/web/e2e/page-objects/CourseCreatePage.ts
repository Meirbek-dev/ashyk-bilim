import type { Page, Locator } from '@playwright/test';
import { expect } from '@playwright/test';

/**
 * Page Object for /en/dash/courses/new — the course creation wizard.
 */
export class CourseCreatePage {
  readonly page: Page;

  readonly titleInput: Locator;
  readonly descriptionTextarea: Locator;
  readonly createButton: Locator;
  readonly errorMessage: Locator;

  constructor(page: Page) {
    this.page = page;
    // The wizard uses id="course-title" on the title input
    this.titleInput = page.locator('#course-title').or(page.locator('input[id*="course-title"]'));
    // Short description textarea
    this.descriptionTextarea = page
      .locator('#course-description')
      .or(page.locator('textarea[id*="course-description"]'));
    // Primary CTA — matches any button containing "create" in the wizard
    this.createButton = page.getByRole('button', { name: /create course|create/i });
    this.errorMessage = page.locator('[role="alert"]').first();
  }

  async goto(): Promise<void> {
    await this.page.goto('/en/dash/courses/new');
    await expect(this.titleInput).toBeVisible({ timeout: 15_000 });
  }

  /**
   * Fill the wizard and submit.
   * Returns the URL-embedded course UUID after redirect to the curriculum page.
   */
  async createCourse(opts: { title: string; description: string }): Promise<string> {
    await this.titleInput.fill(opts.title);
    await this.descriptionTextarea.fill(opts.description);
    await this.createButton.click();

    // After creation, Next.js redirects to /en/dash/courses/<uuid>/curriculum
    await this.page.waitForURL(/\/dash\/courses\/[^/]+\/curriculum/, { timeout: 20_000 });

    const url = this.page.url();
    const match = url.match(/\/courses\/([^/]+)\/curriculum/);
    if (!match) throw new Error(`Could not extract course UUID from URL: ${url}`);
    return match[1];
  }
}
