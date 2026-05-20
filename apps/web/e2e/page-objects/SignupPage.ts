import type { Page, Locator } from '@playwright/test';
import { expect } from '@playwright/test';

/**
 * Page Object for /en/signup
 */
export class SignupPage {
  public readonly page: Page;

  public readonly firstNameInput: Locator;
  public readonly lastNameInput: Locator;
  public readonly emailInput: Locator;
  public readonly passwordInput: Locator;
  public readonly confirmPasswordInput: Locator;
  public readonly submitButton: Locator;
  public readonly errorBanner: Locator;

  public constructor(page: Page) {
    this.page = page;
    this.firstNameInput = page.locator('input[name="firstName"]');
    this.lastNameInput = page.locator('input[name="lastName"]');
    this.emailInput = page.locator('input[name="email"]');
    this.passwordInput = page.locator('input[name="password"]');
    this.confirmPasswordInput = page.locator('input[name="confirmPassword"]');
    this.submitButton = page.locator('form button[type="submit"]');
    this.errorBanner = page.locator('[role="alert"]').first();
  }

  public async goto(): Promise<void> {
    await this.page.goto('/en/signup');
    await expect(this.firstNameInput).toBeVisible();
  }

  public async signup(opts: { firstName: string; lastName: string; email: string; password: string }): Promise<void> {
    await this.firstNameInput.fill(opts.firstName);
    await this.lastNameInput.fill(opts.lastName);
    await this.emailInput.fill(opts.email);
    await this.passwordInput.fill(opts.password);
    await this.confirmPasswordInput.fill(opts.password);
    await this.submitButton.click();
  }
}
