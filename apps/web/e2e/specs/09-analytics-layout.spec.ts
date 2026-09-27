import { expect, testAsAdmin } from '../fixtures'

// UX-239: analytics tab grids use minmax(0, …) tracks, so long course and
// assessment titles scroll inside their tables, never the page.
testAsAdmin.describe('Analytics tabs - layout', () => {
  for (const width of [390, 1280, 1920]) {
    testAsAdmin(`no horizontal page scroll at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      for (const tab of ['overview', 'watchlist', 'performance', 'operations']) {
        await page.goto(`/ru/dash/analytics/${tab}`)
        await expect(page).not.toHaveURL(/\/login/)
        await page.waitForLoadState('networkidle')
        const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
        expect(scrollWidth, tab).toBeLessThanOrEqual(width)
      }
    })
  }
})
