import type { Page, Locator } from '@playwright/test';
import { expect } from '@playwright/test';
import * as path from 'node:path';

/**
 * Page Object for file-submission activities (student side).
 */
export class FileSubmissionPage {
  readonly page: Page;

  /** File upload input (hidden, triggered by the upload area) */
  readonly fileInput: Locator;
  /** The drag-and-drop upload zone */
  readonly dropZone: Locator;
  /** "Submit" / "Upload" button */
  readonly submitButton: Locator;
  /** Status badge after submission */
  readonly statusBadge: Locator;
  /** Success toast */
  readonly toast: Locator;

  constructor(page: Page) {
    this.page = page;
    this.fileInput = page.locator('input[type="file"]').first();
    this.dropZone = page.locator('[data-dropzone], [aria-label*="upload"], .upload-zone').first();
    this.submitButton = page.getByRole('button', { name: /submit|upload|send/i }).first();
    this.statusBadge = page.locator('[data-status-badge], .submission-status, [aria-label*="status"]').first();
    this.toast = page.locator('[data-sonner-toast]').first();
  }

  /**
   * Upload a file and submit.
   * @param filePath - absolute path to the file to upload
   */
  async uploadAndSubmit(filePath: string): Promise<void> {
    // Use setInputFiles for reliable headless file uploads
    await this.fileInput.setInputFiles(filePath);
    await expect(this.page.getByText(path.basename(filePath))).toBeVisible({ timeout: 8_000 });

    await this.submitButton.click();
    await this.page.waitForResponse((r) => r.url().includes('/file-submissions') && r.request().method() === 'POST', {
      timeout: 15_000,
    });
  }

  async assertSubmitted(): Promise<void> {
    await expect(this.page.getByText(/submitted|awaiting grade|pending/i).first()).toBeVisible({ timeout: 10_000 });
  }
}
