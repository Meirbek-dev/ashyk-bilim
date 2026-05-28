import type { Page, Locator } from '@playwright/test'
import { expect } from '@playwright/test'

/**
 * Page Object for /en/dash/courses/<uuid>/gradebook
 * The teacher's grade-at-a-glance table.
 */
export class GradebookPage {
  public readonly page: Page

  /** The main gradebook data table */
  public readonly table: Locator
  /** Filter / preset tabs (e.g. "Needs Grading") */
  public readonly needsGradingTab: Locator
  /** Each row in the table */
  public readonly tableRows: Locator

  public constructor(page: Page) {
    this.page = page
    this.table = page.locator('table, [role="table"]').first()
    this.needsGradingTab = page
      .getByRole('tab', { name: /needs grading|awaiting/i })
      .or(page.getByRole('button', { name: /needs grading|awaiting/i }))
      .first()
    this.tableRows = this.table.locator('tbody tr, [role="row"]')
  }

  public async goto(courseUuid: string): Promise<void> {
    await this.page.goto(`/en/dash/courses/${courseUuid}/gradebook`)
    await this.page.waitForLoadState('networkidle')
    await expect(this.table).toBeVisible({ timeout: 15_000 })
  }

  /**
   * Click on a specific activity column header to open the review page.
   * @param activityName - the activity name that appears in the column header
   */
  public async openActivityReview(activityName: string): Promise<void> {
    const header = this.table
      .locator('th, [role="columnheader"]')
      .filter({ hasText: activityName })
      .first()
    await header.click()
    await this.page.waitForURL(/\/activity\/[^/]+\/review/, { timeout: 10_000 })
  }

  /**
   * Navigate directly to the review page for an activity.
   */
  public async gotoActivityReview(courseUuid: string, activityId: string): Promise<void> {
    await this.page.goto(`/en/dash/courses/${courseUuid}/activity/${activityId}/review`)
    await this.page.waitForLoadState('networkidle')
  }
}
