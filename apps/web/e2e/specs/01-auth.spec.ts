/**
 * SPEC: Authentication flows (v2 BFF)
 *
 * Covers:
 *  - Login with valid credentials
 *  - Login with invalid credentials shows error
 *  - Client-side validation of the login form
 *  - Unauthenticated users are redirected to login
 *
 * v2 has no self-registration or password reset (accounts are provisioned by
 * an administrator or created through Google sign-in), so the legacy sign-up
 * scenarios are gone.
 */

import { test, expect } from '../fixtures'
import { USERS } from '../fixtures/test-data'

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

test.describe('Login', () => {
  test('redirects away from login after successful credentials', async ({ page, loginPage }) => {
    await loginPage.goto()
    await loginPage.loginAndWait(USERS.admin.email, USERS.admin.password)

    // Should be on any authenticated page — not on /login
    expect(page.url()).not.toContain('/login')
  })

  test('shows error message on wrong password', async ({ page, loginPage }) => {
    await loginPage.goto()
    await loginPage.login(USERS.admin.email, 'definitely-wrong-password!')

    // An error alert/banner must become visible
    await expect(loginPage.errorBanner).toBeVisible()
    // Must stay on the login page
    expect(page.url()).toContain('/login')
  })

  test('shows validation error when login is empty', async ({ page, loginPage }) => {
    await loginPage.goto()
    await loginPage.passwordInput.fill('somepassword')
    await loginPage.submitButton.click()

    // A validation error for the login field should appear
    await expect(page.getByText(/required/i).first()).toBeVisible()
    expect(page.url()).toContain('/login')
  })

  test('shows validation error when password is empty', async ({ page, loginPage }) => {
    await loginPage.goto()
    await loginPage.emailInput.fill(USERS.admin.email)
    await loginPage.submitButton.click()

    await expect(page.getByText(/required/i).first()).toBeVisible()
    expect(page.url()).toContain('/login')
  })

  test('surfaces backend redirect errors from the Google flow', async ({ page, loginPage }) => {
    await page.goto('/en/login?error=google-oauth-expired')
    await expect(loginPage.errorBanner).toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// Auth guard
// ---------------------------------------------------------------------------

test.describe('Auth guard', () => {
  test('redirects unauthenticated user from dash to login', async ({ page }) => {
    // Navigate directly to a protected page with no auth state
    await page.goto('/en/dash/courses')
    // Should be redirected to the login page
    await page.waitForURL(/\/login/, { timeout: 10_000 })
    expect(page.url()).toContain('returnTo=')
  })

  test('legacy sign-up route no longer exists', async ({ page }) => {
    const response = await page.goto('/en/signup')
    expect(response?.status()).toBe(404)
  })
})
