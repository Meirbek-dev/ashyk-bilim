import type { Page, Locator } from '@playwright/test'
import { expect } from '@playwright/test'

/**
 * Page Object for /en/dash/admin/users
 * Used by Admin to assign roles to other users.
 */
export class AdminUsersPage {
  public readonly page: Page

  public readonly addRoleButton: Locator
  public readonly userSelect: Locator
  public readonly roleSelect: Locator
  public readonly confirmAssignButton: Locator
  public readonly successToast: Locator

  public constructor(page: Page) {
    this.page = page
    // "Add Role" / "+" button that opens the assignment dialog
    this.addRoleButton = page.getByRole('button', { name: /add role|\+/i }).first()
    // Inside the dialog, the user combobox / select
    this.userSelect = page.getByRole('combobox').first()
    // Inside the dialog, the role combobox / select
    this.roleSelect = page.getByRole('combobox').nth(1)
    // Confirm / Assign button inside the dialog
    this.confirmAssignButton = page.getByRole('button', {
      name: /assign role|confirm|save/i,
    })
    this.successToast = page.locator('[data-sonner-toast]').first()
  }

  public async goto(): Promise<void> {
    await this.page.goto('/en/dash/admin/users')
    await expect(this.addRoleButton).toBeVisible({ timeout: 15_000 })
  }

  /**
   * Assign `roleName` to the user with `userEmail`.
   * Assumes the dialog contains searchable Select components.
   */
  public async assignRole(userEmail: string, roleName: string): Promise<void> {
    await this.addRoleButton.click()

    // The dialog should appear
    const dialog = this.page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    // Select user — the user select is typically the first combo in the dialog
    const userCombo = dialog.getByRole('combobox').first()
    await userCombo.click()
    // Type to search
    const userInput = dialog.locator('input[type="search"], input[role="combobox"]').first()
    await userInput.fill(userEmail)
    await this.page.getByRole('option', { name: new RegExp(userEmail, 'i') }).click()

    // Select role
    const roleCombo = dialog.getByRole('combobox').nth(1)
    await roleCombo.click()
    await this.page.getByRole('option', { name: new RegExp(roleName, 'i') }).click()

    // Confirm
    await dialog.getByRole('button', { name: /assign role|save|confirm/i }).click()

    // Expect success toast
    await expect(this.page.locator('[data-sonner-toast]').first()).toBeVisible({
      timeout: 10_000,
    })
  }
}
