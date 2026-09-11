import type { Page, Locator } from '@playwright/test'
import { expect } from '@playwright/test'

/**
 * Page Object for the Assessment activity from the student perspective.
 * Handles exam attempts and code-challenge submission.
 */
export class AssessmentPage {
  public readonly page: Page

  /** "Start exam / attempt" button */
  public readonly startButton: Locator
  /** "Submit" button for finishing an exam attempt */
  public readonly submitButton: Locator
  /** Result / score display after submission */
  public readonly resultDisplay: Locator
  /** Code editor textarea / code mirror input */
  public readonly codeEditor: Locator
  /** "Run" / "Test" button in code challenge */
  public readonly runCodeButton: Locator
  /** "Submit solution" button in code challenge */
  public readonly submitCodeButton: Locator
  /** Pass/fail status text */
  public readonly attemptStatus: Locator

  public constructor(page: Page) {
    this.page = page
    // v2 learner action bar: "Start assessment"
    this.startButton = page.getByRole('button', { name: /^start( exam| assessment)?$|begin attempt|take exam/i }).first()
    // v2 assessment action bar: "Submit" (opens the confirmation dialog)
    this.submitButton = page.getByRole('button', { name: /^submit( exam| attempt)?$|finish/i }).first()
    this.resultDisplay = page.locator('[data-result], .result, .score, [aria-label*="score"]').first()
    this.codeEditor = page.locator('.cm-editor .cm-content, .monaco-editor textarea, textarea[name*="code"]').first()
    this.runCodeButton = page.getByRole('button', { name: /run|test code/i }).first()
    this.submitCodeButton = page.getByRole('button', { name: /submit solution|submit code/i }).first()
    this.attemptStatus = page.locator('text=Graded, text=Submitted, text=Pending, [data-status]').first()
  }

  // ── Exam helpers ─────────────────────────────────────────────────────────

  public async startAttempt(): Promise<void> {
    const started = this.page.waitForResponse(
      r => r.request().method() === 'POST' && /\/assessments\/[^/]+\/submissions$/u.test(r.url()),
      { timeout: 15_000 },
    )
    await this.startButton.click()
    const response = await started
    expect(response.ok(), `start attempt → ${response.status()} ${await response.text()}`).toBe(true)
    await this.enterFullscreenIfRequired()
  }

  /**
   * Exams with `fullscreen_required` gate the attempt behind an "Enter
   * fullscreen" overlay (a click is the user gesture the browser needs).
   */
  public async enterFullscreenIfRequired(): Promise<void> {
    const enter = this.page.getByRole('button', { name: /enter fullscreen/i })
    const gated = await enter
      .waitFor({ state: 'visible', timeout: 3000 })
      .then(() => true)
      .catch(() => false)
    if (gated) {
      await enter.click()
      await expect(enter).toBeHidden({ timeout: 10_000 })
    }
  }

  /**
   * The question group (`role="group"`, labelled by the question title) whose
   * prompt contains `questionText`. v2 renders one question at a time (card
   * mode) by default, so switch to scroll mode first to have every question
   * on the page — the exam shuffles questions and options, so we address
   * questions and options by text, never by index.
   */
  public async question(questionText: string | RegExp): Promise<Locator> {
    await this.enterFullscreenIfRequired()
    const scrollToggle = this.page.getByRole('button', { name: /switch to scroll mode/i })
    if (await scrollToggle.isVisible()) await scrollToggle.click()
    const group = this.page.getByRole('group').filter({ hasText: questionText }).first()
    await expect(group).toBeVisible({ timeout: 10_000 })
    return group
  }

  /** Answer a single-choice / true-false question (Base UI radio, labelled by the option text). */
  public async answerChoice(questionText: string | RegExp, optionText: string | RegExp): Promise<void> {
    const group = await this.question(questionText)
    const radio = group.getByRole('radio', { name: optionText })
    await radio.click()
    await expect(radio).toBeChecked()
  }

  /** Answer a multiple-choice question (Base UI checkboxes). */
  public async answerMultiSelect(questionText: string | RegExp, optionTexts: (string | RegExp)[]): Promise<void> {
    const group = await this.question(questionText)
    for (const optionText of optionTexts) {
      const checkbox = group.getByRole('checkbox', { name: optionText })
      await checkbox.click()
      await expect(checkbox).toBeChecked()
    }
  }

  /** "Submit" (action bar) → confirm dialog "Submit" → `POST submissions/{id}/submit`. */
  public async submitAttempt(): Promise<void> {
    await this.submitButton.click()
    // "Confirm Submission" is an alertdialog
    const dialog = this.page.getByRole('alertdialog').or(this.page.getByRole('dialog')).first()
    await expect(dialog).toBeVisible()
    const submitted = this.page.waitForResponse(
      r => r.request().method() === 'POST' && /\/submissions\/[^/]+\/submit$/u.test(r.url()),
      { timeout: 15_000 },
    )
    await dialog.getByRole('button', { name: /^submit$/i }).click()
    const response = await submitted
    expect(response.ok(), `submit → ${response.status()} ${await response.text()}`).toBe(true)
  }

  // ── Code challenge helpers ───────────────────────────────────────────────

  public async fillCodeEditor(code: string): Promise<void> {
    await this.codeEditor.click()
    // Select all and replace
    await this.page.keyboard.press('Control+A')
    await this.codeEditor.fill(code)
  }

  public async submitCode(): Promise<void> {
    await this.submitCodeButton.click()
    await this.page.waitForResponse(r => r.url().includes('/code-execution') || r.url().includes('/assessments'), {
      timeout: 30_000,
    })
  }
}
