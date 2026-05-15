import type { Page, Locator } from '@playwright/test';
import { expect } from '@playwright/test';

/**
 * Page Object for /en/login
 */
export class LoginPage {
  readonly page: Page;

  // Selectors rely on `name` attributes and ARIA labels — not locale-specific text.
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;
  readonly errorBanner: Locator;

  constructor(page: Page) {
    this.page = page;
    this.emailInput = page.locator('input[name="email"]');
    this.passwordInput = page.locator('input[name="password"]');
    // The login button is the only submit-type button in the auth form
    this.submitButton = page.locator('form button[type="submit"]');
    this.errorBanner = page.locator('[role="alert"]').first();
  }

  async goto(): Promise<void> {
    await this.page.goto('/en/login');
    await expect(this.emailInput).toBeVisible();
  }

  async login(email: string, password: string): Promise<void> {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
  }

  /** Login and wait for redirect to the dashboard/home. */
  async loginAndWait(email: string, password: string): Promise<void> {
    await this.login(email, password);
    await this.page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15_000 });
  }
}
