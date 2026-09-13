import type { Page, Locator } from '@playwright/test'
import { expect } from '@playwright/test'

/**
 * Page Object for the activity studio pages:
 *   /en/dash/courses/<uuid>/activity/<activityid>/studio
 *
 * Covers dynamic page (lecture) editor, exam builder, and file-submission editor.
 */
export class ActivityStudioPage {
  public readonly page: Page

  // ── Name field (shared across all activity types) ─────────────────────
  public readonly activityNameInput: Locator

  // ── Dynamic / lecture editor ──────────────────────────────────────────
  /** The rich-text / block editor content area */
  public readonly editorContent: Locator
  /** Toolbar button that opens the block-insert menu */
  public readonly addBlockButton: Locator

  // ── Exam / quiz builder ───────────────────────────────────────────────
  /** "Add question" button */
  public readonly addQuestionButton: Locator
  /** Question type dropdown / combobox */
  public readonly questionTypeSelect: Locator

  // ── Shared ────────────────────────────────────────────────────────────
  public readonly saveButton: Locator
  public readonly savedBadge: Locator
  public readonly toast: Locator

  public constructor(page: Page) {
    this.page = page

    this.activityNameInput = page.locator('input[placeholder*="Activity name"], input[name*="name"]').first()

    this.editorContent = page.locator('.ProseMirror, [contenteditable="true"], [data-lexical-editor]').first()

    this.addBlockButton = page.getByRole('button', { name: /add block|\+ block|insert/i }).first()

    this.addQuestionButton = page.getByRole('button', { name: /add question|new question|\+ question/i }).first()

    this.questionTypeSelect = page.getByRole('combobox', { name: /question type|type/i }).first()

    this.saveButton = page.getByRole('button', { name: /save/i }).first()
    this.savedBadge = page.getByText(/activity saved/i).first()
    this.toast = page.locator('[data-sonner-toast]').first()
  }

  public async goto(courseUuid: string, activityId: string): Promise<void> {
    await this.page.goto(`/en/dash/courses/${courseUuid}/activity/${activityId}/studio`)
    await this.page.waitForLoadState('networkidle')
  }

  // ── Lecture / dynamic page helpers ────────────────────────────────────

  /**
   * Type text into the block editor.
   * Assumes the editor is a contenteditable element.
   */
  public async typeInEditor(text: string): Promise<void> {
    await this.editorContent.click()
    await this.editorContent.pressSequentially(text)
    await this.waitForAutosave()
  }

  /** v2 page editor autosaves (debounced) — wait for the "Activity saved!" indicator. */
  public async waitForAutosave(): Promise<void> {
    // onChange flips the indicator to "Saving..." synchronously, the debounced
    // PATCH lands ~1.5s later.
    await expect(this.page.getByText(/^saving/i).first()).toBeVisible({ timeout: 5000 })
    await expect(this.page.getByText(/activity saved/i).first()).toBeVisible({ timeout: 15_000 })
  }

  /**
   * Insert a block of the given type using the block-insert toolbar / slash menu.
   * @param blockTypeLabel - visible label in the insert menu, e.g. "Heading", "Callout"
   */
  public async insertBlock(blockTypeLabel: string): Promise<void> {
    // Trigger the slash-command menu on a fresh empty paragraph (the menu only
    // opens at the start of a block)
    await this.editorContent.click()
    await this.page.keyboard.press('Control+End')
    await this.page.keyboard.press('Enter')
    await this.page.keyboard.type('/')
    // v2 slash menu (cmdk) lists variants, e.g. "Info Callout" / "Warning Callout" — take the first match
    const option = this.page.getByRole('option', { name: new RegExp(blockTypeLabel, 'i') }).first()
    await expect(option).toBeVisible({ timeout: 5000 })
    await option.click()
    await this.waitForAutosave()
  }

  // ── Exam / quiz helpers ───────────────────────────────────────────────

  /**
   * Add a choice question to the exam through the v2 Questions Builder:
   * "New question" → "Choice" creates the item (POST `assessments/{id}/items`),
   * the inspector then edits it and autosaves (PATCH `assessment-items/{id}`).
   * @param kind - v2 choice variant (`#choice-kind` select)
   * @param questionText - the prompt (also used as the item title)
   * @param choices - option texts (ignored for `trueFalse`, whose options are fixed)
   * @param correctIndex - 0-based index of the correct answer (single / trueFalse)
   * @param correctIndices - 0-based indices of the correct answers (multiple)
   */
  public async addExamQuestion(opts: {
    kind: 'single' | 'multiple' | 'trueFalse'
    questionText: string
    choices?: string[]
    correctIndex?: number
    correctIndices?: number[]
  }): Promise<string> {
    const created = this.page.waitForResponse(
      r => r.request().method() === 'POST' && /\/assessments\/[^/]+\/items$/u.test(r.url()),
      { timeout: 15_000 },
    )
    await this.addQuestionButton.click()
    await this.page.getByRole('menuitem', { name: /choice/i }).click()
    const createResponse = await created
    expect(createResponse.ok(), `item create → ${createResponse.status()}`).toBe(true)
    const { id: itemId } = (await createResponse.json()) as { id: string }

    // The new item is selected in the outline; make sure its inspector is open.
    await this.page.locator(`#item-${itemId}`).click()
    const kindSelect = this.page.locator('#choice-kind')
    await expect(kindSelect).toBeVisible({ timeout: 10_000 })

    const kindLabel = { single: 'Single choice', multiple: 'Multiple choice', trueFalse: 'True/false' }[opts.kind]
    await kindSelect.selectOption({ label: kindLabel })

    await this.page.locator('#canvas-item-title').fill(opts.questionText)
    const prompt = this.page.locator('#choice-prompt-field .ProseMirror')
    await prompt.click()
    await this.page.keyboard.type(opts.questionText)

    const options = this.page.locator('#choice-options-field')
    const optionInputs = options.getByPlaceholder(/^Option [A-Z]$/)
    if (opts.choices && opts.kind !== 'trueFalse') {
      while ((await optionInputs.count()) < opts.choices.length) {
        await options.getByRole('button', { name: /add option/i }).click()
      }
      for (const [i, text] of opts.choices.entries()) {
        await optionInputs.nth(i).fill(text)
      }
    }

    const correctToggles = options.getByRole('button', { name: /toggle correct answer/i })
    const markCorrect = async (index: number) => {
      const toggle = correctToggles.nth(index)
      await toggle.click()
      await expect(toggle).toHaveAttribute('aria-pressed', 'true')
    }
    if (opts.correctIndex !== undefined) await markCorrect(opts.correctIndex)
    for (const index of opts.correctIndices ?? []) await markCorrect(index)

    // Autosave: the last edit is followed by a debounced PATCH; wait until the
    // item ledger reports it saved and the outline shows the new title.
    const saved = await this.page.waitForResponse(
      r => r.request().method() === 'PATCH' && r.url().includes(`/assessment-items/${itemId}`),
      { timeout: 15_000 },
    )
    expect(saved.ok(), `item save → ${saved.status()}`).toBe(true)
    await expect(this.page.getByText(/all changes saved/i).first()).toBeVisible({ timeout: 15_000 })
    await expect(this.page.locator(`#item-${itemId}`)).toContainText(opts.questionText)
    return itemId
  }

  /**
   * Publish the assessment lifecycle (draft → published) from the studio's
   * Publish view: "Publish Now" → confirm dialog (audit note is mandatory for
   * high-stakes exams) → `POST assessments/{id}/lifecycle`.
   */
  public async publishAssessment(courseUuid: string, activityId: string): Promise<void> {
    await this.page.goto(`/en/dash/courses/${courseUuid}/activity/${activityId}/studio?view=publish`)
    await this.page.waitForLoadState('networkidle')
    await this.page.getByRole('button', { name: /publish now/i }).click()

    const dialog = this.page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    const auditNote = dialog.locator('#publish-audit-note')
    if (await auditNote.isVisible()) await auditNote.fill('E2E publish')

    const lifecycle = this.page.waitForResponse(
      r => r.request().method() === 'POST' && /\/assessments\/[^/]+\/lifecycle$/u.test(r.url()),
      { timeout: 15_000 },
    )
    await dialog.getByRole('button', { name: /^publish( (exam|assessment|quiz|challenge))?$/i }).click()
    const response = await lifecycle
    expect(response.ok(), `lifecycle → ${response.status()} ${await response.text()}`).toBe(true)
    await expect(this.page.getByText(/^published$/i).first()).toBeVisible({ timeout: 10_000 })
  }

  /**
   * Publish a file-submission activity from its studio ("Publish" →
   * `POST file-submissions/{id}/publish`); learners get 404 until then.
   */
  public async publishFileSubmission(courseUuid: string, activityId: string): Promise<void> {
    await this.goto(courseUuid, activityId)
    const published = this.page.waitForResponse(
      r => r.request().method() === 'POST' && /\/file-submissions\/[^/]+\/publish$/u.test(r.url()),
      { timeout: 15_000 },
    )
    await this.page.getByRole('button', { name: /^publish$/i }).click()
    const response = await published
    expect(response.ok(), `publish → ${response.status()} ${await response.text()}`).toBe(true)
    await expect(this.page.getByText(/file submission published|^published$/i).first()).toBeVisible({
      timeout: 10_000,
    })
  }

  /** Save and confirm success badge or toast */
  public async save(): Promise<void> {
    await this.saveButton.click()
    await expect(this.page.locator('[data-sonner-toast]').first().or(this.savedBadge)).toBeVisible({
      timeout: 10_000,
    })
  }
}
