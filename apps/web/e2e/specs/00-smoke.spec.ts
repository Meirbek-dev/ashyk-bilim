/**
 * SPEC: Smoke Tests — Quick sanity checks that the app is up and basic
 * pages render without JS errors or missing network requests.
 *
 * These run first (no auth required) and catch catastrophic failures
 * early in the pipeline.
 */

import { test, expect } from '../fixtures'
import { STORAGE_STATE } from '../auth-states'

test.describe('Smoke – Public pages', () => {
  test('home page has the correct title', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/Ashyk? Bilim|LMS/i)
  })

  test('login page renders the email and password fields', async ({ page }) => {
    await page.goto('/en/login')
    await expect(page.locator('input[name="email"]')).toBeVisible()
    await expect(page.locator('input[name="password"]')).toBeVisible()
    await expect(page.locator('form button[type="submit"]')).toBeVisible()
  })

  test('signup page renders the registration form', async ({ page }) => {
    await page.goto('/en/signup')
    await expect(page.locator('input[name="firstName"]')).toBeVisible()
    await expect(page.locator('input[name="email"]')).toBeVisible()
    await expect(page.locator('input[name="password"]')).toBeVisible()
  })

  test('page returns HTTP 200 for the home route', async ({ page }) => {
    const response = await page.goto('/')
    expect(response?.status()).toBe(200)
  })

  test('API health endpoint responds with 200', async ({ page }) => {
    const apiUrl = process.env.E2E_API_URL ?? 'http://localhost:1338/api/v1'
    const response = await page.request.get(`${apiUrl}/health`)
    expect(response.status()).toBe(200)
  })

  test('Russian locale (default) renders the home page', async ({ page }) => {
    // The app default locale is ru-RU with prefix /ru
    await page.goto('/ru')
    await expect(page).not.toHaveURL(/\/error/)
    await expect(page.locator('body')).toBeVisible()
  })

  test('404 page renders for unknown routes', async ({ page }) => {
    const response = await page.goto('/this-route-does-not-exist-xyz')
    // Either the status is 404 or the page contains a not-found message
    const isNotFound =
      response?.status() === 404 ||
      (await page
        .getByText(/not found|404|page not found/i)
        .isVisible()
        .catch(() => false))
    expect(isNotFound).toBe(true)
  })
})

test.describe('Smoke – Authenticated dashboard (Teacher)', () => {
  test.use({ storageState: STORAGE_STATE.teacher })

  test('teacher can reach the courses dashboard', async ({ page }) => {
    await page.goto('/en/dash/courses')
    await expect(page).not.toHaveURL(/\/login/)
    // Some content from the courses dashboard should be visible
    await expect(page.locator('body')).toBeVisible()
  })
})
