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

    this.activityNameInput = page
      .locator('input[placeholder*="Activity name"], input[name*="name"]')
      .first()

    this.editorContent = page
      .locator('.ProseMirror, [contenteditable="true"], [data-lexical-editor]')
      .first()

    this.addBlockButton = page.getByRole('button', { name: /add block|\+ block|insert/i }).first()

    this.addQuestionButton = page
      .getByRole('button', { name: /add question|new question|\+ question/i })
      .first()

    this.questionTypeSelect = page.getByRole('combobox', { name: /question type|type/i }).first()

    this.saveButton = page.getByRole('button', { name: /save/i }).first()
    this.savedBadge = page.locator('text=Saved').first()
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
    await this.editorContent.type(text)
  }

  /**
   * Insert a block of the given type using the block-insert toolbar / slash menu.
   * @param blockTypeLabel - visible label in the insert menu, e.g. "Heading", "Callout"
   */
  public async insertBlock(blockTypeLabel: string): Promise<void> {
    // Trigger the slash-command / block insert menu
    await this.editorContent.click()
    await this.page.keyboard.type('/')
    await expect(
      this.page.getByRole('option', { name: new RegExp(blockTypeLabel, 'i') }),
    ).toBeVisible({
      timeout: 5000,
    })
    await this.page.getByRole('option', { name: new RegExp(blockTypeLabel, 'i') }).click()
  }

  // ── Exam / quiz helpers ───────────────────────────────────────────────

  /**
   * Add a question of a given type to the exam.
   * @param type - e.g. "Multiple choice", "True/False", "Multi-select"
   * @param questionText - the question body text
   * @param choices - array of choice strings (for choice-type questions)
   * @param correctIndex - 0-based index of the correct answer (for single-choice)
   */
  public async addExamQuestion(opts: {
    type: string
    questionText: string
    choices?: string[]
    correctIndex?: number
    correctIndices?: number[]
  }): Promise<void> {
    await this.addQuestionButton.click()

    // Select type if a type picker is shown
    const typePicker = this.page.getByRole('option', {
      name: new RegExp(opts.type, 'i'),
    })
    if (await typePicker.isVisible({ timeout: 2000 }).catch(() => false)) {
      await typePicker.click()
    }

    // Wait for the question editor to appear
    const questionEditor = this.page
      .locator('[data-question-editor], .question-editor, .assessment-item')
      .last()
    await expect(questionEditor).toBeVisible({ timeout: 8000 })

    // Fill the question text
    const questionInput = questionEditor
      .locator('input[type="text"], textarea, [contenteditable="true"]')
      .first()
    await questionInput.fill(opts.questionText)

    // Fill choices if provided
    if (opts.choices) {
      for (let i = 0; i < opts.choices.length; i += 1) {
        const choiceInput = questionEditor.locator('input[type="text"]').nth(i + 1)
        if (!(await choiceInput.isVisible().catch(() => false))) {
          // Add another choice option
          const addChoiceBtn = questionEditor.getByRole('button', {
            name: /add\s*(choice|option)/i,
          })
          await addChoiceBtn.click()
        }
        const choiceText = opts.choices[i]
        if (choiceText !== undefined) {
          await choiceInput.fill(choiceText)
        }
      }

      // Mark correct answer(s)
      if (opts.correctIndex !== undefined) {
        await questionEditor.locator('input[type="radio"]').nth(opts.correctIndex).check()
      }
      if (opts.correctIndices) {
        for (const idx of opts.correctIndices) {
          await questionEditor.locator('input[type="checkbox"]').nth(idx).check()
        }
      }
    }
  }

  /** Save and confirm success badge or toast */
  public async save(): Promise<void> {
    await this.saveButton.click()
    await expect(this.page.locator('[data-sonner-toast]').first().or(this.savedBadge)).toBeVisible({
      timeout: 10_000,
    })
  }
}
