import type { Page, Locator } from '@playwright/test'
import { expect } from '@playwright/test'

/**
 * Page Object for /en/dash/courses/new — the course creation wizard.
 */
export class CourseCreatePage {
  public readonly page: Page

  public readonly titleInput: Locator
  public readonly createButton: Locator
  public readonly errorMessage: Locator

  public constructor(page: Page) {
    this.page = page
    // The wizard uses id="course-title" on the title input
    this.titleInput = page.locator('#course-title').or(page.locator('input[id*="course-title"]'))
    // v2: the wizard is title + structure only — description/access/media live in
    // Course Studio (details stage), so there is no description field here.
    // Primary CTA — matches any button containing "create" in the wizard
    this.createButton = page.getByRole('button', {
      name: /create course|create/i,
    })
    this.errorMessage = page.locator('[role="alert"]').first()
  }

  public async goto(): Promise<void> {
    await this.page.goto('/en/dash/courses/new')
    await expect(this.titleInput).toBeVisible({ timeout: 15_000 })
  }

  /**
   * Fill the wizard and submit.
   * Returns the URL-embedded course UUID after redirect to the course overview
   * (v2 lands on `/dash/courses/<uuid>`, the Course Studio overview).
   */
  public async createCourse(opts: { title: string }): Promise<string> {
    await this.titleInput.fill(opts.title)
    await this.createButton.click()

    await this.page.waitForURL(/\/dash\/courses\/(?!new)[^/?#]+(?:[/?#]|$)/, {
      timeout: 20_000,
    })

    const url = this.page.url()
    const match = /\/courses\/([^/?#]+)/.exec(url)
    if (!match?.[1]) throw new Error(`Could not extract course UUID from URL: ${url}`)
    return match[1]
  }
}
