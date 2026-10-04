import { AxeBuilder } from '@axe-core/playwright'
import { test as base, expect, type Page } from '@playwright/test'

// The shared fixture of every spec (spec 9): a test fails on any console error or CSP violation, on a
// repeated GET of the same URL within one navigation, on serious/critical axe findings, and on
// horizontal page overflow at 390 px. Specs import `test` and `expect` from here, never from Playwright.

/** Paths a test expects to be read again within one navigation: a colleague's change arrives as an event. */
const repeatable = new WeakMap<Page, string[]>()

/** Declares that `pathname` is read again on purpose (a change made elsewhere while the page is open, B-NOT-14). */
export function expectReread(page: Page, pathname: string): void {
  repeatable.set(page, [...(repeatable.get(page) ?? []), pathname])
}

function watch(page: Page, problems: string[]): void {
  let requested = new Set<string>()
  page.on('framenavigated', frame => {
    if (frame === page.mainFrame()) requested = new Set()
  })
  page.on('request', request => {
    if (request.method() !== 'GET' || !['fetch', 'xhr'].includes(request.resourceType())) return
    // A worker's bulk action has no event: its status is polled by design (grading B-GRD-27).
    const { pathname } = new URL(request.url())
    if (pathname.startsWith('/api/v2/bulk-actions/') || repeatable.get(page)?.includes(pathname)) return
    if (requested.has(request.url()))
      problems.push(`duplicate GET ${request.url()} (first: ${outcome.get(request.url())})`)
    requested.add(request.url())
  })
  // How the first read ended: a retried network failure or 5xx reads differently from a second fetch by the app.
  const outcome = new Map<string, string>()
  page.on('response', response => outcome.set(response.url(), String(response.status())))
  page.on('requestfailed', request => outcome.set(request.url(), request.failure()?.errorText ?? 'failed'))
  page.on('console', message => {
    // A 4xx answer is shown in place by the app; Chromium still logs it as a resource error.
    const expected4xx = message.text().startsWith('Failed to load resource: the server responded with a status of 4')
    if (message.type() === 'error' && !expected4xx) problems.push(`console: ${message.text()}`)
  })
  page.on('pageerror', error => problems.push(`page error: ${error.message}`))
  // Against a built server (E2E_BASE_URL) every document carries the CSP the violations above are checked against.
  page.on('response', response => {
    const document = response.request().isNavigationRequest() && response.frame() === page.mainFrame()
    if (document && process.env['E2E_BASE_URL'] && response.ok() && !response.headers()['content-security-policy'])
      problems.push(`no Content-Security-Policy on ${response.url()}`)
  })
}

async function inspect(page: Page, problems: string[]): Promise<void> {
  // Contrast measured mid-fade (a tooltip opening on focus) is not the page's contrast: let transitions end first.
  // The checks judge the hydrated page: an SSR form keeps its controls disabled (faded) until then.
  await page.waitForLoadState('load')
  await page.waitForFunction(() => !document.querySelector('[data-hydrating]'), null, { timeout: 10_000 })
  await page.evaluate(() => Promise.allSettled(document.getAnimations().map(animation => animation.finished)))
  const axe = await new AxeBuilder({ page }).analyze()
  for (const violation of axe.violations) {
    if (violation.impact === 'serious' || violation.impact === 'critical') {
      const nodes = violation.nodes.map(node => node.target.join(' ')).join(', ')
      problems.push(`axe ${violation.impact}: ${violation.id} at ${nodes} ${violation.helpUrl}`)
    }
  }
  const viewport = page.viewportSize()
  await page.setViewportSize({ width: 390, height: 844 })
  // The layout at 390 px once it settled: an open floating element (a focused button's tooltip, B-NOT-13 in CI)
  // is repositioned on resize a frame later; measured before that, it sits at its desktop x.
  const overflow = await page.evaluate(async () => {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    return document.documentElement.scrollWidth - document.documentElement.clientWidth
  })
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

/**
 * Navigates and waits until the signed-in page has hydrated and opened its event stream (`GET /me/events`, spec 7.7).
 * Use it instead of `waitForLoadState('networkidle')`, which never comes while that stream is open.
 */
export async function gotoLive(page: Page, url: string): Promise<void> {
  const live = page.waitForResponse(response => new URL(response.url()).pathname === '/api/v2/me/events')
  await page.goto(url)
  await live
}
