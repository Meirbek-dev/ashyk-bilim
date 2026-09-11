import type { Page, Locator } from '@playwright/test'
import { expect } from '@playwright/test'
import * as path from 'node:path'

/**
 * Page Object for file-submission activities (student side).
 */
export class FileSubmissionPage {
  public readonly page: Page

  /** File upload input (hidden, triggered by the upload area) */
  public readonly fileInput: Locator
  /** The drag-and-drop upload zone */
  public readonly dropZone: Locator
  /** "Submit" / "Upload" button */
  public readonly submitButton: Locator
  /** Status badge after submission */
  public readonly statusBadge: Locator
  /** Success toast */
  public readonly toast: Locator

  public constructor(page: Page) {
    this.page = page
    this.fileInput = page.locator('input[type="file"]').first()
    this.dropZone = page.locator('[data-dropzone], [aria-label*="upload"], .upload-zone').first()
    // v2 learner workspace: "Save draft" / "Submit files"
    this.submitButton = page.getByRole('button', { name: /^submit files$/i }).first()
    this.statusBadge = page.locator('[data-status-badge], .submission-status, [aria-label*="status"]').first()
    this.toast = page.locator('[data-sonner-toast]').first()
  }

  /**
   * Upload a file and submit.
   * @param filePath - absolute path to the file to upload
   */
  public async uploadAndSubmit(filePath: string): Promise<void> {
    // Use setInputFiles for reliable headless file uploads
    await this.fileInput.setInputFiles(filePath)
    await expect(this.page.getByText(path.basename(filePath))).toBeVisible({
      timeout: 8000,
    })

    // v2: draft (POST …/draft) → presigned upload → POST file-submissions/{id}/submit
    const submitted = this.page.waitForResponse(
      r => r.request().method() === 'POST' && /\/file-submissions\/[^/]+\/submit$/u.test(r.url()),
      { timeout: 30_000 },
    )
    await this.submitButton.click()
    const response = await submitted
    expect(response.ok(), `submit → ${response.status()} ${await response.text()}`).toBe(true)
  }

  public async assertSubmitted(): Promise<void> {
    await expect(this.page.getByText(/submitted|awaiting grade|pending/i).first()).toBeVisible({
      timeout: 10_000,
    })
  }
}
