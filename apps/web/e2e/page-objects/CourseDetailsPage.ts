import type { Page, Locator } from '@playwright/test'
import { expect } from '@playwright/test'

/**
 * Page Object for /en/dash/courses/<uuid>/details
 * (Course general settings: title, description, thumbnail, tags, visibility)
 */
export class CourseDetailsPage {
  public readonly page: Page

  public readonly titleInput: Locator
  public readonly descriptionTextarea: Locator
  public readonly saveButton: Locator
  public readonly savedBadge: Locator

  public constructor(page: Page) {
    this.page = page
    // EditCourseGeneral form uses react-hook-form — fields have no `id` by
    // default, so we target them by their label associations.
    this.titleInput = page.getByRole('textbox', { name: /course\s*title|name/i }).first()
    this.descriptionTextarea = page.getByRole('textbox', { name: /short\s*description|description/i }).first()
    this.saveButton = page.getByRole('button', { name: /save/i }).first()
    this.savedBadge = page.locator('text=Saved').first()
  }

  public async goto(courseUuid: string): Promise<void> {
    await this.page.goto(`/en/dash/courses/${courseUuid}/details`)
    await this.page.waitForLoadState('networkidle')
  }

  public async updateTitle(newTitle: string): Promise<void> {
    await this.titleInput.fill(newTitle)
    await this.saveButton.click()
    await expect(this.savedBadge).toBeVisible({ timeout: 10_000 })
  }
}
