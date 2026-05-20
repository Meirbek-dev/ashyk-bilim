import type { Page, Locator } from '@playwright/test';
import { expect } from '@playwright/test';

/**
 * Page Object for /en/dash/courses/<uuid>/curriculum
 * Manages chapter and activity creation in the DnD curriculum editor.
 */
export class CurriculumEditorPage {
  readonly page: Page;

  /** "Add chapter" / "+ New chapter" button */
  readonly addChapterButton: Locator;
  /** The inline input that appears after clicking addChapterButton */
  readonly chapterNameInput: Locator;
  /** Toast notifications from sonner */
  readonly toast: Locator;

  constructor(page: Page) {
    this.page = page;
    this.addChapterButton = page.getByRole('button', { name: /add chapter|new chapter|\+ chapter/i }).first();
    // The new-chapter inline input — rendered when showChapterInput===true
    this.chapterNameInput = page.locator('input[placeholder*="chapter"], input[placeholder*="Chapter"]').last();
    this.toast = page.locator('[data-sonner-toast]').first();
  }

  async goto(courseUuid: string): Promise<void> {
    await this.page.goto(`/en/dash/courses/${courseUuid}/curriculum`);
    await this.page.waitForLoadState('networkidle');
    await expect(this.addChapterButton).toBeVisible({ timeout: 15_000 });
  }

  /** Create a new chapter and wait for it to appear in the list. */
  async createChapter(name: string): Promise<void> {
    await this.addChapterButton.click();
    await expect(this.chapterNameInput).toBeVisible();
    await this.chapterNameInput.fill(name);
    await this.chapterNameInput.press('Enter');
    // The chapter should now appear in the list
    await expect(this.page.getByText(name)).toBeVisible({ timeout: 10_000 });
  }

  /**
   * Open the "Add activity" dropdown for a specific chapter and select a type.
   * @param chapterName - the visible chapter title to target
   * @param activityType - human label shown in the dropdown, e.g. "Dynamic", "Exam"
   */
  async addActivityToChapter(chapterName: string, activityType: string): Promise<void> {
    // Find the chapter row
    const chapterRow = this.page
      .locator('[data-chapter-element], .chapter-element, li')
      .filter({ hasText: chapterName })
      .first();

    await expect(chapterRow).toBeVisible({ timeout: 10_000 });

    // Expand chapter if collapsed
    const expandButton = chapterRow.getByRole('button', { name: /expand|open|show/i });
    if (await expandButton.isVisible()) await expandButton.click();

    // Click the "Add activity" button inside the chapter
    const addActivityBtn = chapterRow.getByRole('button', { name: /add activity|add lesson|\+ activity/i }).first();
    await addActivityBtn.click();

    // A dropdown/menu should appear
    await this.page.getByRole('menuitem', { name: new RegExp(activityType, 'i') }).click();

    // Wait for the activity creation to complete (new item should appear)
    await this.page.waitForResponse(
      (resp) => resp.url().includes('/activities') && resp.request().method() === 'POST',
      { timeout: 10_000 },
    );
  }

  /**
   * Click "Configure" on an activity item to navigate to its studio page.
   * Returns the activity UUID extracted from the resulting URL.
   */
  async configureActivity(activityName: string): Promise<string> {
    const activityRow = this.page
      .locator('[data-activity-element], .activity-element, li')
      .filter({ hasText: activityName })
      .first();

    await expect(activityRow).toBeVisible({ timeout: 10_000 });

    const configureBtn = activityRow.getByRole('button', { name: /configure/i });
    await configureBtn.click();

    await this.page.waitForURL(/\/activity\/[^/]+\/studio/, { timeout: 10_000 });

    const match = this.page.url().match(/\/activity\/([^/]+)\/studio/);
    if (!match?.[1]) throw new Error(`Could not extract activity id from: ${this.page.url()}`);
    return match[1];
  }
}
