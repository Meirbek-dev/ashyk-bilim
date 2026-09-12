/**
 * SPEC: Authentication flows (v2 BFF)
 *
 * Covers:
 *  - Login with valid credentials
 *  - Login with invalid credentials shows error
 *  - Client-side validation of the login form
 *  - Unauthenticated users are redirected to login
 *  - Self-registration (`POST /auth/register`) followed by a login
 *
 * Password reset is still not part of v2 (DECISIONS.md 2026-09-12).
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

})

// ---------------------------------------------------------------------------
// Sign-up
// ---------------------------------------------------------------------------

test.describe('Sign-up', () => {
  test('registers a new account, lands on login with a success message, then signs in', async ({
    page,
    signupPage,
    loginPage,
  }) => {
    const stamp = Date.now()
    const email = `e2e-signup-${stamp}@test.local`
    const password = 'Signup1234!'

    await signupPage.goto()
    await signupPage.signup({
      firstName: 'E2E',
      lastName: 'Signup',
      username: `e2e-signup-${stamp}`,
      email,
      password,
    })

    // Success: toast + the login page (no session is opened by registration).
    await page.waitForURL(/\/login/, { timeout: 15_000 })
    await expect(page.locator('[data-sonner-toast]').first()).toBeVisible()

    await loginPage.loginAndWait(email, password)
    expect(page.url()).not.toContain('/login')
  })

  test('shows the taken-email error inline', async ({ page, signupPage }) => {
    await signupPage.goto()
    await signupPage.signup({
      firstName: 'Dup',
      lastName: 'User',
      username: `e2e-dup-${Date.now()}`,
      email: USERS.admin.email,
      password: 'Signup1234!',
    })
    // `email-taken` lands on the email field as a field error.
    await expect(signupPage.errorBanner).toBeVisible({ timeout: 10_000 })
    expect(page.url()).toContain('/signup')
  })

  test('shows validation errors for an empty form', async ({ page, signupPage }) => {
    await signupPage.goto()
    await signupPage.submitButton.click()
    await expect(page.getByText(/required/i).first()).toBeVisible()
    expect(page.url()).toContain('/signup')
  })
})
