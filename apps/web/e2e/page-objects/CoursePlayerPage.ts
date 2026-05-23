import type { Page, Locator } from '@playwright/test';
import { expect } from '@playwright/test';

/**
 * Page Object for the student course-player:
 *   /en/course/<courseuuid>
 *   /en/course/<courseuuid>/activity/<activityid>
 */
export class CoursePlayerPage {
  public readonly page: Page;

  /** Sidebar list of activities */
  public readonly activityList: Locator;
  /** "Mark as complete" / "Continue" button */
  public readonly markCompleteButton: Locator;
  /** Enroll / Start course button on the course landing */
  public readonly enrollButton: Locator;
  /** Certificate download button (appears after completion) */
  public readonly downloadCertButton: Locator;
  /** Progress bar or percentage text */
  public readonly progressIndicator: Locator;

  public constructor(page: Page) {
    this.page = page;
    this.activityList = page.locator('nav[aria-label*="activities"], aside ul, .activity-list').first();
    this.markCompleteButton = page.getByRole('button', { name: /mark.*complete|complete|done|continue/i }).first();
    this.enrollButton = page.getByRole('button', { name: /enroll|start course|get started/i }).first();
    this.downloadCertButton = page
      .getByRole('link', { name: /download certificate|certificate/i })
      .or(page.getByRole('button', { name: /download certificate|certificate/i }))
      .first();
    this.progressIndicator = page.locator('[role="progressbar"], [aria-label*="progress"]').first();
  }

  public async gotoCourseLanding(courseUuid: string): Promise<void> {
    await this.page.goto(`/en/course/${courseUuid}`);
    await this.page.waitForLoadState('networkidle');
  }

  public async gotoActivity(courseUuid: string, activityId: string): Promise<void> {
    await this.page.goto(`/en/course/${courseUuid}/activity/${activityId}`);
    await this.page.waitForLoadState('networkidle');
  }

  public async enroll(): Promise<void> {
    await this.enrollButton.click();
    // Wait for the page to update — enroll may redirect or update in-place
    await this.page.waitForResponse((r) => r.url().includes('/trail') && r.request().method() === 'POST', {
      timeout: 10_000,
    });
  }

  public async markComplete(): Promise<void> {
    await this.markCompleteButton.click();
    await this.page.waitForResponse((r) => r.url().includes('/trail') && r.request().method() !== 'GET', {
      timeout: 10_000,
    });
  }

  /** Click on a specific activity in the sidebar by name */
  public async clickActivity(activityName: string): Promise<void> {
    await this.activityList.getByText(activityName).click();
    await this.page.waitForURL(/\/activity\//, { timeout: 10_000 });
  }

  /** Assert the certificate download button is visible */
  public async assertCertificateAvailable(): Promise<void> {
    await expect(this.downloadCertButton).toBeVisible({ timeout: 20_000 });
  }
}
