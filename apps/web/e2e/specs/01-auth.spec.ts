/**
 * SPEC: Authentication flows
 *
 * Covers:
 *  - Login with valid credentials
 *  - Login with invalid credentials shows error
 *  - Sign-up with a new account
 *  - Sign-up with a duplicate email shows error
 *  - Unauthenticated users are redirected to login
 */

import { test, expect } from '../fixtures';
import { USERS } from '../fixtures/test-data';

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

test.describe('Login', () => {
  test('redirects away from login after successful credentials', async ({ page, loginPage }) => {
    await loginPage.goto();
    await loginPage.loginAndWait(USERS.admin.email, USERS.admin.password);

    // Should be on any authenticated page — not on /login
    expect(page.url()).not.toContain('/login');
  });

  test('shows error message on wrong password', async ({ page, loginPage }) => {
    await loginPage.goto();
    await loginPage.login(USERS.admin.email, 'definitely-wrong-password!');

    // An error alert/banner must become visible
    await expect(loginPage.errorBanner).toBeVisible();
    // Must stay on the login page
    expect(page.url()).toContain('/login');
  });

  test('shows validation error when email is empty', async ({ page, loginPage }) => {
    await loginPage.goto();
    await loginPage.passwordInput.fill('somepassword');
    await loginPage.submitButton.click();

    // A validation error for the email field should appear
    await expect(page.getByText(/required|email/i).first()).toBeVisible();
    expect(page.url()).toContain('/login');
  });

  test('shows validation error when password too short', async ({ page, loginPage }) => {
    await loginPage.goto();
    await loginPage.emailInput.fill(USERS.admin.email);
    await loginPage.passwordInput.fill('short');
    await loginPage.submitButton.click();

    await expect(page.getByText(/password.*length|at least/i).first()).toBeVisible();
    expect(page.url()).toContain('/login');
  });
});

// ---------------------------------------------------------------------------
// Sign-up
// ---------------------------------------------------------------------------

test.describe('Sign-up', () => {
  // Use a unique email per run to avoid the "already exists" error
  const uniqueEmail = () => `e2e-signup-${Date.now()}@test.local`;

  test('creates a new account and redirects', async ({ page, signupPage }) => {
    await signupPage.goto();
    await signupPage.signup({
      firstName: 'Test',
      lastName: 'User',
      email: uniqueEmail(),
      password: 'TestUser1234!',
    });

    // After successful signup the app should redirect away from /signup
    await page.waitForURL((url) => !url.pathname.includes('/signup'), { timeout: 15_000 });
    expect(page.url()).not.toContain('/signup');
  });

  test('shows error when email is already registered', async ({ page, signupPage }) => {
    await signupPage.goto();
    // Use an email we know already exists (admin)
    await signupPage.signup({
      firstName: 'Dup',
      lastName: 'User',
      email: USERS.admin.email,
      password: 'TestUser1234!',
    });

    await expect(signupPage.errorBanner).toBeVisible({ timeout: 10_000 });
    expect(page.url()).toContain('/signup');
  });

  test('shows validation error when passwords do not match', async ({ page, signupPage }) => {
    await signupPage.goto();
    await signupPage.firstNameInput.fill('Test');
    await signupPage.lastNameInput.fill('User');
    await signupPage.emailInput.fill(uniqueEmail());
    await signupPage.passwordInput.fill('Password1234!');
    await signupPage.confirmPasswordInput.fill('DifferentPassword1234!');
    await signupPage.submitButton.click();

    await expect(page.getByText(/passwords.*(do not|don't) match/i).first()).toBeVisible();
    expect(page.url()).toContain('/signup');
  });
});

// ---------------------------------------------------------------------------
// Auth guard
// ---------------------------------------------------------------------------

test.describe('Auth guard', () => {
  test('redirects unauthenticated user from dash to login', async ({ page }) => {
    // Navigate directly to a protected page with no auth state
    await page.goto('/en/dash/courses');
    // Should be redirected to the login page
    await page.waitForURL(/\/login/, { timeout: 10_000 });
    expect(page.url()).toContain('/login');
  });
});
