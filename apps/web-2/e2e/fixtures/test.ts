import { AxeBuilder } from '@axe-core/playwright'
import { test as base, expect, type Page } from '@playwright/test'

// The shared fixture of every spec (spec 9): a test fails on any console error or CSP violation, on a
// repeated GET of the same URL within one navigation, on serious/critical axe findings, and on
// horizontal page overflow at 390 px. Specs import `test` and `expect` from here, never from Playwright.

function watch(page: Page, problems: string[]): void {
  let requested = new Set<string>()
  page.on('framenavigated', frame => {
    if (frame === page.mainFrame()) requested = new Set()
  })
  page.on('request', request => {
    if (request.method() !== 'GET' || !['fetch', 'xhr'].includes(request.resourceType())) return
    if (requested.has(request.url())) problems.push(`duplicate GET ${request.url()}`)
    requested.add(request.url())
  })
  page.on('console', message => {
    // A 4xx answer is shown in place by the app; Chromium still logs it as a resource error.
    const expected4xx = message.text().startsWith('Failed to load resource: the server responded with a status of 4')
    if (message.type() === 'error' && !expected4xx) problems.push(`console: ${message.text()}`)
  })
  page.on('pageerror', error => problems.push(`page error: ${error.message}`))
}

async function inspect(page: Page, problems: string[]): Promise<void> {
  const axe = await new AxeBuilder({ page }).analyze()
  for (const violation of axe.violations) {
    if (violation.impact === 'serious' || violation.impact === 'critical') {
      problems.push(`axe ${violation.impact}: ${violation.id} (${violation.nodes.length} nodes) ${violation.helpUrl}`)
    }
  }
  const viewport = page.viewportSize()
  await page.setViewportSize({ width: 390, height: 844 })
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  if (overflow > 0) problems.push(`horizontal overflow of ${overflow}px at 390px on ${page.url()}`)
  if (viewport) await page.setViewportSize(viewport)
}

export const test = base.extend({
  page: async ({ page }, use) => {
    const problems: string[] = []
    watch(page, problems)
    // CSP is enforced on the stand: a violation fails the test.
    await page.exposeFunction('reportCspViolation', (violation: string) => problems.push(`CSP violation: ${violation}`))
    await page.addInitScript(() => {
      document.addEventListener('securitypolicyviolation', event => {
        void Reflect.get(window, 'reportCspViolation')(`${event.violatedDirective} blocked ${event.blockedURI}`)
      })
    })
    await use(page)
    if (page.url().startsWith('http')) await inspect(page, problems)
    expect(problems, 'page health (e2e/fixtures/test.ts)').toEqual([])
  },
})

export { expect }
