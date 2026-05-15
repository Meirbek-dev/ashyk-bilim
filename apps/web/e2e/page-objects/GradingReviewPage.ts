import type { Page, Locator } from '@playwright/test';
import { expect } from '@playwright/test';

/**
 * Page Object for grading review pages:
 *   /en/dash/courses/<uuid>/activity/<activityid>/review
 *
 * Covers the GradingReviewWorkspace: submission list + grade form.
 */
export class GradingReviewPage {
  readonly page: Page;

  /** List of student submissions in the left pane */
  readonly submissionList: Locator;
  /** Individual submission list items */
  readonly submissionItems: Locator;
  /** Score / grade input field */
  readonly scoreInput: Locator;
  /** Feedback textarea */
  readonly feedbackTextarea: Locator;
  /** "Publish grade" / "Save" / "Approve" button */
  readonly publishButton: Locator;
  /** Status badge on a submission (Graded, Pending, etc.) */
  readonly statusBadge: Locator;
  /** Toast notification */
  readonly toast: Locator;

  constructor(page: Page) {
    this.page = page;
    this.submissionList = page
      .locator('[data-submission-list], aside ul, .submission-list')
      .first();
    this.submissionItems = page
      .locator('[data-submission-item], .submission-item, [role="listitem"]');
    this.scoreInput = page.locator('input[name*="score"], input[type="number"]').first();
    this.feedbackTextarea = page
      .locator('textarea[name*="feedback"], textarea[placeholder*="feedback" i]')
      .first();
    this.publishButton = page
      .getByRole('button', { name: /publish grade|save grade|approve|release/i })
      .first();
    this.statusBadge = page.locator('[data-status-badge], .grade-status, .submission-status').first();
    this.toast = page.locator('[data-sonner-toast]').first();
  }

  async goto(courseUuid: string, activityId: string): Promise<void> {
    await this.page.goto(`/en/dash/courses/${courseUuid}/activity/${activityId}/review`);
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Select a submission from the list by student name or email fragment.
   */
  async selectSubmission(studentIdentifier: string): Promise<void> {
    const item = this.page
      .locator('[data-submission-item], .submission-item, [role="listitem"], li')
      .filter({ hasText: studentIdentifier })
      .first();
    await expect(item).toBeVisible({ timeout: 15_000 });
    await item.click();
    // Wait for the inspector panel to load
    await expect(this.scoreInput.or(this.feedbackTextarea)).toBeVisible({ timeout: 8_000 });
  }

  /**
   * Fill the grade form and publish.
   */
  async gradeSubmission(opts: { score: number; feedback: string }): Promise<void> {
    // Fill score
    await this.scoreInput.fill(String(opts.score));
    // Fill feedback
    await this.feedbackTextarea.fill(opts.feedback);
    // Publish
    await this.publishButton.click();
    // Wait for success signal
    await expect(
      this.page.locator('[data-sonner-toast]').first().or(
        this.page.getByText(/graded|published|released/i).first(),
      ),
    ).toBeVisible({ timeout: 10_000 });
  }

  /**
   * Assert that the submission status shows "Graded" or "Released".
   */
  async assertGradedStatus(): Promise<void> {
    await expect(
      this.page.getByText(/graded|released/i).first(),
    ).toBeVisible({ timeout: 10_000 });
  }
}
