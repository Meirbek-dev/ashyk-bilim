import type { Page, Locator } from '@playwright/test'
import { expect } from '@playwright/test'

/**
 * Page Object for grading review pages:
 *   /en/dash/courses/<uuid>/activity/<activityid>/review
 *
 * v2 review workspaces (file submissions and assessments) share one layout:
 * a left queue of learner buttons ("<name> Attempt N · …") and an inspector
 * with a "Final score" spinbutton, a Markdown feedback editor and the
 * "Save grade" / "Return for revision" / "Publish result" actions.
 */
export class GradingReviewPage {
  public readonly page: Page

  /** Individual submission list items (queue buttons) */
  public readonly submissionItems: Locator
  /** Score / grade input field */
  public readonly scoreInput: Locator
  /** Feedback editor (Tiptap/ProseMirror, labelled "… editor") */
  public readonly feedbackEditor: Locator
  /** "Save grade" button */
  public readonly saveGradeButton: Locator
  /** "Publish result" button (releases the grade to the learner) */
  public readonly publishButton: Locator
  /** Toast notification */
  public readonly toast: Locator

  public constructor(page: Page) {
    this.page = page
    this.submissionItems = page.getByRole('complementary').getByRole('button', { name: /attempt #?\d+/i })
    this.scoreInput = page.getByRole('spinbutton', { name: /final score|score/i }).first()
    this.feedbackEditor = page.getByRole('textbox', { name: /feedback|explanation editor/i }).first()
    this.saveGradeButton = page.getByRole('button', { name: /^save grade$/i }).first()
    this.publishButton = page.getByRole('button', { name: /^publish( result| grade)?$|^release$/i }).first()
    this.toast = page.locator('[data-sonner-toast]').first()
  }

  public async goto(courseUuid: string, activityId: string): Promise<void> {
    await this.page.goto(`/en/dash/courses/${courseUuid}/activity/${activityId}/review`)
    await this.page.waitForLoadState('networkidle')
  }

  /** The queue button for a learner (by name / email fragment). */
  public submissionItem(studentIdentifier: string | RegExp): Locator {
    return this.submissionItems.filter({ hasText: studentIdentifier }).first()
  }

  /**
   * Select a submission from the queue by student name or email fragment.
   */
  public async selectSubmission(studentIdentifier: string | RegExp): Promise<void> {
    const item = this.submissionItem(studentIdentifier)
    await expect(item).toBeVisible({ timeout: 15_000 })
    await item.click()
    // Wait for the inspector panel to load (overall "Final score" for file
    // submissions, per-item score inputs for auto-graded assessments)
    await expect(this.scoreInput.or(this.page.getByRole('spinbutton').first())).toBeVisible({ timeout: 8000 })
  }

  /**
   * Fill the grade form, save it, then publish (release) the result.
   * Both are `PATCH file-submission-attempts/{id}/grade` (file submissions)
   * or `POST submissions/{id}/grade` (assessments); each must be 2xx.
   */
  public async gradeSubmission(opts: { score: number; feedback: string }): Promise<void> {
    await this.scoreInput.fill(String(opts.score))
    await this.feedbackEditor.click()
    await this.page.keyboard.type(opts.feedback)

    await this.expectGradeWrite(() => this.saveGradeButton.click())
    await expect(this.page.getByText(/submission updated|grade saved|saved/i).first()).toBeVisible({ timeout: 10_000 })

    await this.expectGradeWrite(() => this.publishButton.click())
  }

  /** Run a grading action and assert its write succeeded on the wire. */
  public async expectGradeWrite(action: () => Promise<void>): Promise<void> {
    const write = this.page.waitForResponse(
      r => r.request().method() !== 'GET' && /\/(?:file-submission-attempts|submissions)\/[^/]+\/(?:grade|publish)/u.test(r.url()),
      { timeout: 15_000 },
    )
    await action()
    const response = await write
    expect(response.ok(), `${response.url()} → ${response.status()} ${await response.text()}`).toBe(true)
  }

  /**
   * Assert that the learner's queue entry shows "graded" or "published"
   * (the queue button text is "<name> Attempt N · <files> <status>").
   */
  public async assertGradedStatus(studentIdentifier: string | RegExp): Promise<void> {
    await expect(this.submissionItem(studentIdentifier)).toContainText(/graded|published|released/i, {
      timeout: 10_000,
    })
  }
}
