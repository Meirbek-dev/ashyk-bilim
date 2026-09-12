import type { Page, Locator } from '@playwright/test'
import { expect } from '@playwright/test'

/**
 * Page Object for the student course-player:
 *   /en/course/<courseuuid>
 *   /en/course/<courseuuid>/activity/<activityid>
 */
export class CoursePlayerPage {
  public readonly page: Page

  /** Sidebar list of activities */
  public readonly activityList: Locator
  /** "Mark as complete" / "Continue" button */
  public readonly markCompleteButton: Locator
  /** Enroll / Start course button on the course landing */
  public readonly enrollButton: Locator
  /** Certificate download button (appears after completion) */
  public readonly downloadCertButton: Locator
  /** Progress bar or percentage text */
  public readonly progressIndicator: Locator

  public constructor(page: Page) {
    this.page = page
    this.activityList = page.locator('nav[aria-label*="activities"], aside ul, .activity-list').first()
    this.markCompleteButton = page.getByRole('button', { name: /^mark as complete$/i }).first()
    this.enrollButton = page.getByRole('button', { name: /enroll|start course|get started/i }).first()
    this.downloadCertButton = page
      .getByRole('link', { name: /download certificate|certificate/i })
      .or(page.getByRole('button', { name: /download certificate|certificate/i }))
      .first()
    this.progressIndicator = page.locator('[role="progressbar"], [aria-label*="progress"]').first()
  }

  public async gotoCourseLanding(courseUuid: string): Promise<void> {
    await this.page.goto(`/en/course/${courseUuid}`)
    await this.page.waitForLoadState('networkidle')
  }

  public async gotoActivity(courseUuid: string, activityId: string): Promise<void> {
    await this.page.goto(`/en/course/${courseUuid}/activity/${activityId}`)
    await this.page.waitForLoadState('networkidle')
  }

  public async enroll(): Promise<void> {
    await this.enrollButton.click()
    // v2: "Start Course" runs `POST trail/courses/{id}` through a server action
    // (no API response to observe) and then routes to the first activity.
    await this.page.waitForURL(/\/course\/[^/]+\/activity\//, { timeout: 15_000 })
  }

  public async markComplete(): Promise<void> {
    const marked = this.page.waitForResponse(
      r => r.request().method() === 'POST' && /\/trail\/activities\/[^/]+$/u.test(r.url()),
      { timeout: 10_000 },
    )
    await this.markCompleteButton.click()
    const response = await marked
    expect(response.ok(), `mark complete → ${response.status()} ${await response.text()}`).toBe(true)
  }

  /**
   * Open an activity from the course landing outline ("Course Lessons":
   * chapters are collapsible buttons, activities are links to
   * `/course/<id>/activity/<id>`). Returns the activity id from the URL.
   */
  public async openActivity(activityName: string | RegExp): Promise<string> {
    const link = this.page.getByRole('link', { name: activityName }).first()
    if (!(await link.isVisible())) {
      // Expand every collapsed chapter (only the first is open by default)
      for (const chapter of await this.page.getByRole('button', { expanded: false }).filter({ hasText: /activit/i }).all()) {
        await chapter.click()
      }
    }
    await expect(link).toBeVisible({ timeout: 10_000 })
    await link.click()
    await this.page.waitForURL(/\/activity\//, { timeout: 10_000 })
    const match = /\/activity\/([^/?#]+)/.exec(this.page.url())
    if (!match?.[1]) throw new Error(`Could not extract activity id from: ${this.page.url()}`)
    return match[1]
  }

  /**
   * v2 surfaces the learner's certificate on the Progress page (`/trail`):
   * the course card shows "Download Certificate" once every required
   * activity is complete and `courses/{id}/certificates/me` has issued one.
   */
  public trailCourseCard(courseUuid: string): Locator {
    return this.page.locator(`[data-trail-course="${courseUuid}"]`)
  }

  public async gotoTrail(): Promise<void> {
    await this.page.goto('/en/trail')
    await this.page.waitForLoadState('networkidle')
  }

  /** Assert the certificate download link is visible on the course's trail card */
  public async assertCertificateAvailable(courseUuid: string): Promise<void> {
    await this.gotoTrail()
    const card = this.trailCourseCard(courseUuid)
    await expect(card).toBeVisible({ timeout: 15_000 })
    // v2 offers «Download PDF» (a button) next to the «View certificate» link.
    await expect(
      card
        .getByRole('link', { name: /view certificate|download certificate|certificate/i })
        .or(card.getByRole('button', { name: /download pdf|certificate/i }))
        .first(),
    ).toBeVisible({ timeout: 20_000 })
  }

  /** Assert the course's trail card offers no certificate yet */
  public async assertCertificateNotAvailable(courseUuid: string): Promise<void> {
    await this.gotoTrail()
    const card = this.trailCourseCard(courseUuid)
    await expect(card).toBeVisible({ timeout: 15_000 })
    await expect(card.getByRole('link', { name: /view certificate|download certificate|certificate/i })).toHaveCount(0)
    await expect(card.getByRole('button', { name: /download pdf/i })).toHaveCount(0)
  }
}
