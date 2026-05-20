import type { Page, Locator } from '@playwright/test';

/**
 * Page Object for the Assessment activity from the student perspective.
 * Handles exam attempts and code-challenge submission.
 */
export class AssessmentPage {
  readonly page: Page;

  /** "Start exam / attempt" button */
  readonly startButton: Locator;
  /** "Submit" button for finishing an exam attempt */
  readonly submitButton: Locator;
  /** Result / score display after submission */
  readonly resultDisplay: Locator;
  /** Code editor textarea / code mirror input */
  readonly codeEditor: Locator;
  /** "Run" / "Test" button in code challenge */
  readonly runCodeButton: Locator;
  /** "Submit solution" button in code challenge */
  readonly submitCodeButton: Locator;
  /** Pass/fail status text */
  readonly attemptStatus: Locator;

  constructor(page: Page) {
    this.page = page;
    this.startButton = page.getByRole('button', { name: /start|begin attempt|take exam/i }).first();
    this.submitButton = page.getByRole('button', { name: /submit exam|submit attempt|finish/i }).first();
    this.resultDisplay = page.locator('[data-result], .result, .score, [aria-label*="score"]').first();
    this.codeEditor = page.locator('.cm-editor .cm-content, .monaco-editor textarea, textarea[name*="code"]').first();
    this.runCodeButton = page.getByRole('button', { name: /run|test code/i }).first();
    this.submitCodeButton = page.getByRole('button', { name: /submit solution|submit code/i }).first();
    this.attemptStatus = page.locator('text=Graded, text=Submitted, text=Pending, [data-status]').first();
  }

  // ── Exam helpers ─────────────────────────────────────────────────────────

  async startAttempt(): Promise<void> {
    await this.startButton.click();
    await this.page.waitForResponse((r) => r.url().includes('/assessments') && r.request().method() === 'POST', {
      timeout: 10_000,
    });
  }

  /**
   * Answer a multiple-choice or true/false question.
   * @param questionIndex - 0-based question index
   * @param answerIndex - 0-based index of the answer to select
   */
  async answerChoiceQuestion(questionIndex: number, answerIndex: number): Promise<void> {
    const questionBlock = this.page.locator('[data-question], .question-block, fieldset').nth(questionIndex);
    await questionBlock.locator('input[type="radio"]').nth(answerIndex).check();
  }

  /**
   * Answer a multi-select question.
   * @param questionIndex - 0-based
   * @param answerIndices - array of 0-based indices to check
   */
  async answerMultiSelectQuestion(questionIndex: number, answerIndices: number[]): Promise<void> {
    const questionBlock = this.page.locator('[data-question], .question-block, fieldset').nth(questionIndex);
    for (const idx of answerIndices) {
      await questionBlock.locator('input[type="checkbox"]').nth(idx).check();
    }
  }

  async submitAttempt(): Promise<void> {
    await this.submitButton.click();
    // Confirm submission in a possible dialog
    const confirmBtn = this.page.getByRole('button', { name: /confirm|yes/i });
    if (await confirmBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await confirmBtn.click();
    }
    await this.page.waitForResponse((r) => r.url().includes('/assessments') && r.request().method() !== 'GET', {
      timeout: 15_000,
    });
  }

  // ── Code challenge helpers ───────────────────────────────────────────────

  async fillCodeEditor(code: string): Promise<void> {
    await this.codeEditor.click();
    // Select all and replace
    await this.page.keyboard.press('Control+A');
    await this.codeEditor.fill(code);
  }

  async submitCode(): Promise<void> {
    await this.submitCodeButton.click();
    await this.page.waitForResponse((r) => r.url().includes('/code-execution') || r.url().includes('/assessments'), {
      timeout: 30_000,
    });
  }
}
