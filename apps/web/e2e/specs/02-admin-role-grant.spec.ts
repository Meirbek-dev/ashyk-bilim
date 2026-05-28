/**
 * SPEC: Admin – Role Orchestration
 *
 * Phase 0: User Orchestration & Setup
 *
 * Verifies that an Admin can navigate to the User Roles panel and assign
 * the "Teacher" role to another user via the UI.
 *
 * NOTE: The global-setup already performs role assignment via the API (fast path).
 * These tests verify that the *UI workflow* for role assignment is also functioning.
 * They use the Admin storage state and operate on pre-existing test users.
 *
 * Bug policy: If the role assignment UI is broken (dialog doesn't open, combobox
 * doesn't filter, etc.), these tests will fail as expected. Do NOT lower assertions
 * to make broken UI pass.
 */

import { testAsAdmin as test, expect } from '../fixtures'
import { USERS } from '../fixtures/test-data'
import { STORAGE_STATE } from '../auth-states'

test.describe('Admin – User Roles Panel', () => {
  test('admin can navigate to the User Roles admin page', async ({ page }) => {
    await page.goto('/en/dash/admin/users')
    await expect(page).toHaveURL(/\/dash\/admin\/users/)
    // The page should contain the role assignment panel
    await expect(page.getByRole('heading', { name: /user roles|roles/i }).first()).toBeVisible({
      timeout: 15_000,
    })
  })

  test('admin can see the list of existing role assignments', async ({ page }) => {
    await page.goto('/en/dash/admin/users')
    // After loading, the table / list of assignments should render
    await expect(page.locator('table, [role="table"], .data-table').first()).toBeVisible({
      timeout: 15_000,
    })
  })

  test('admin can open the Add Role dialog', async ({ page }) => {
    await page.goto('/en/dash/admin/users')
    const addButton = page.getByRole('button', { name: /add role|\+/i }).first()
    await expect(addButton).toBeVisible({ timeout: 15_000 })
    await addButton.click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('combobox').first()).toBeVisible()
  })

  /**
   * BUG PROTOCOL: If this test fails because the user-select combobox does not
   * filter by email or the role assignment POST fails, the failure is intentional.
   * Do NOT add skip/workaround. Fix the root cause in the codebase instead.
   */
  test('admin can assign the Teacher role to the teacher user via UI', async ({ page, adminUsersPage }) => {
    await adminUsersPage.goto()
    await adminUsersPage.assignRole(USERS.teacher.email, 'Teacher')

    // After assignment, the table should show the teacher with the Teacher role
    await expect(page.getByRole('cell', { name: new RegExp(USERS.teacher.email, 'i') }).first()).toBeVisible({
      timeout: 10_000,
    })
  })

  test('admin cannot access roles panel as a non-admin', async ({ browser }) => {
    // Open a fresh context with student storage state — student has no admin permissions
    const context = await browser.newContext({
      storageState: STORAGE_STATE.student,
    })
    const page = await context.newPage()
    await page.goto('/en/dash/admin/users')

    // Should be redirected or show an unauthorized/access-denied page
    await page.waitForURL(url => url.pathname.includes('/unauthorized') || url.pathname.includes('/login'), {
      timeout: 10_000,
    })
    await context.close()
  })
})
