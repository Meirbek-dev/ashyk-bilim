import type { Page, Locator } from '@playwright/test'
import { expect } from '@playwright/test'

/** Labels of the v2 "Add Activity" dialog rows (`Components.NewActivity.*`, en-US). */
export type CurriculumActivityType = 'Dynamic' | 'File Submission' | 'Exam' | 'Code Challenge'

/**
 * Page Object for /en/dash/courses/<uuid>/curriculum
 * Manages chapter and activity creation in the DnD curriculum editor.
 *
 * v2 layout: chapters are cards (`[data-chapter-element]`) with an inline
 * "Add Chapter" input at the bottom; each card has an "Add Activity" button
 * that opens a dialog listing the activity types. Dynamic pages and code
 * challenges are quick-created from that list; file submissions and exams
 * open a sub-form inside the dialog.
 */
export class CurriculumEditorPage {
  public readonly page: Page

  /** "Add Chapter" button */
  public readonly addChapterButton: Locator
  /** The inline input that appears after clicking addChapterButton */
  public readonly chapterNameInput: Locator
  /** Toast notifications from sonner */
  public readonly toast: Locator

  public constructor(page: Page) {
    this.page = page
    this.addChapterButton = page.getByRole('button', { name: /add chapter|new chapter|\+ chapter/i }).first()
    // The new-chapter inline input — rendered when showChapterInput===true
    this.chapterNameInput = page.locator('input[placeholder*="chapter"], input[placeholder*="Chapter"]').last()
    this.toast = page.locator('[data-sonner-toast]').first()
  }

  public async goto(courseUuid: string): Promise<void> {
    await this.page.goto(`/en/dash/courses/${courseUuid}/curriculum`)
    await this.page.waitForLoadState('networkidle')
    await expect(this.addChapterButton).toBeVisible({ timeout: 15_000 })
  }

  /** Create a new chapter and wait for it to appear in the list. */
  public async createChapter(name: string): Promise<void> {
    await this.addChapterButton.click()
    await expect(this.chapterNameInput).toBeVisible()
    await this.chapterNameInput.fill(name)
    await this.chapterNameInput.press('Enter')
    // The chapter should now appear as a card
    await expect(this.chapterCard(name)).toBeVisible({ timeout: 10_000 })
  }

  /** The chapter card (`[data-chapter-element]`) whose header shows `chapterName`. */
  public chapterCard(chapterName: string): Locator {
    return this.page.locator('[data-chapter-element]').filter({ hasText: chapterName }).first()
  }

  /** The activity row (`[data-activity-element]`) whose name matches. */
  public activityRow(activityName: string | RegExp): Locator {
    return this.page.locator('[data-activity-element]').filter({ hasText: activityName }).first()
  }

  /**
   * Open the "Add Activity" dialog for a specific chapter and create an activity.
   * @param chapterName - the visible chapter title to target
   * @param activityType - row label in the dialog, e.g. "Dynamic", "Exam"
   * @param name - activity name (quick-created types are renamed inline afterwards)
   * @returns the created activity id (from the creating POST response)
   */
  public async addActivityToChapter(
    chapterName: string,
    activityType: CurriculumActivityType,
    name?: string,
  ): Promise<string> {
    const chapterRow = this.chapterCard(chapterName)
    await expect(chapterRow).toBeVisible({ timeout: 10_000 })

    await chapterRow.getByRole('button', { name: /add activity/i }).first().click()
    const dialog = this.page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    // Dynamic pages are created through a Next server action (no `/api/v2`
    // response to observe), so detect creation from the DOM: a new
    // `[data-activity-element]` row in this chapter.
    const rowIds = () =>
      chapterRow.locator('[data-activity-element]').evaluateAll(els => els.map(el => el.getAttribute('data-activity-element')))
    const before = new Set(await rowIds())

    await dialog.getByRole('button', { name: new RegExp(activityType, 'i') }).first().click()

    if (activityType === 'File Submission') {
      await dialog.getByRole('textbox', { name: /^title$/i }).fill(name ?? 'File submission')
      const instructions = dialog.locator('.ProseMirror').first()
      await instructions.click()
      await this.page.keyboard.type('Upload your project as a PDF.')
      await dialog.getByRole('button', { name: /create activity/i }).click()
    } else if (activityType === 'Exam') {
      await dialog.getByRole('textbox', { name: /activity name/i }).fill(name ?? 'Exam')
      await dialog.getByRole('textbox', { name: /exam title/i }).fill(name ?? 'Exam')
      await dialog.getByRole('textbox', { name: /exam description/i }).fill('Covers the whole course.')
      await dialog.getByRole('button', { name: /create exam/i }).click()
      // The exam modal navigates to the new assessment's studio.
      await this.page.waitForURL(/\/activity\/[^/]+\/studio/, { timeout: 15_000 })
      const match = /\/activity\/([^/]+)\/studio/.exec(this.page.url())
      if (!match?.[1]) throw new Error(`Could not extract exam activity id from: ${this.page.url()}`)
      return match[1]
    }

    await expect(dialog).toBeHidden({ timeout: 15_000 })
    let activityId: string | undefined
    await expect
      .poll(async () => (activityId = (await rowIds()).find(id => id && !before.has(id)) ?? undefined), {
        timeout: 15_000,
        message: `new ${activityType} row in chapter "${chapterName}"`,
      })
      .toBeTruthy()
    const row = this.page.locator(`[data-activity-element="${activityId}"]`)
    await expect(row).toBeVisible({ timeout: 10_000 })

    if (name && (activityType === 'Dynamic' || activityType === 'Code Challenge')) {
      await this.renameActivity(row, name)
    }
    return activityId as string
  }

  /**
   * Make an activity learner-visible through the row's globe ("Publish")
   * toggle; the row badge flips from Draft to Live.
   */
  public async publishActivity(activityName: string | RegExp): Promise<void> {
    const row = this.activityRow(activityName)
    await expect(row).toBeVisible({ timeout: 10_000 })
    const unpublish = row.getByRole('button', { name: /^unpublish$/i })
    // Publishing an assessment's lifecycle already flips its activity live.
    if (await unpublish.isVisible()) return
    await row.getByRole('button', { name: /^publish$/i }).click()
    await expect(unpublish).toBeVisible({ timeout: 10_000 })
  }

  /** Inline rename through the row's pencil ("Edit") button. */
  public async renameActivity(row: Locator, name: string): Promise<void> {
    await row.getByRole('button', { name: /^edit$/i }).click()
    const input = row.getByRole('textbox')
    await input.fill(name)
    await input.press('Enter')
    // updateActivity is a server action; the row re-renders from the refetched structure
    await expect(row.getByText(name)).toBeVisible({ timeout: 10_000 })
    await expect(row.getByRole('textbox')).toBeHidden()
  }

  /**
   * Open the studio for an activity row (v2: the "Open edit page" link, which
   * targets a new tab — we read its href and navigate in place).
   * Returns the activity id extracted from the resulting URL.
   */
  public async configureActivity(activityName: string | RegExp): Promise<string> {
    const activityRow = this.activityRow(activityName)
    await expect(activityRow).toBeVisible({ timeout: 10_000 })

    // The edit link renders as `<a role="button">` (nativeButton={false})
    const href = await activityRow
      .locator('a')
      .filter({ hasText: /open edit page/i })
      .first()
      .getAttribute('href')
    const match = /\/activity\/([^/]+)\//.exec(href ?? '')
    if (!match?.[1]) throw new Error(`Could not extract activity id from edit link: ${href}`)

    // UX-029: both row links are locale-prefixed; the edit link goes straight
    // to the studio instead of bouncing through `/editor/…/edit` and a bare `/dash`.
    expect(href).toMatch(/^\/en\/dash\/courses\/[^/]+\/activity\/[^/]+\/studio$/)
    await expect(activityRow.locator('a[target="_blank"]').first()).toHaveAttribute(
      'href',
      /^\/en\/course\/[^/]+\/activity\/[^/]+$/,
    )

    await this.page.goto(href as string)
    await this.page.waitForLoadState('networkidle')
    return match[1]
  }
}
