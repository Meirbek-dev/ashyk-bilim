import { AxeBuilder } from '@axe-core/playwright'
import { test as base, expect, type BrowserContext, type Locator, type Page } from '@playwright/test'
import { matchesFailure, type ExpectedFailure } from './http-failures'

// The shared fixture of every spec (spec 9): a test fails on any console error or CSP violation, on a
// repeated GET of the same URL within one navigation, on serious/critical axe findings, and on
// horizontal page overflow at 390 px. Specs import `test` and `expect` from here, never from Playwright.

/** Paths a test expects to be read again within one navigation: a colleague's change arrives as an event. */
const repeatable = new WeakMap<Page, string[]>()

/** Declares that `pathname` is read again on purpose (a change made elsewhere while the page is open, B-NOT-14). */
export function expectReread(page: Page, pathname: string): void {
  repeatable.set(page, [...(repeatable.get(page) ?? []), pathname])
}

/**
 * Reads the live events refresh by design (spec 7.7): the shared seed accounts see every parallel test's collections,
 * groups, users and roles (`collection.updated`, `admin.updated`) and every grading in the shared teacher's courses
 * (`grading.updated`: the work queue), and a learner's progress is projected after their own writes
 * (`progress.updated`, `xp.awarded`) and a post's own `discussion.updated`. A second GET of these within one navigation is not the
 * app reading twice.
 */
const LIVE_READS = [
  /^\/api\/v2\/gamification$/,
  /^\/api\/v2\/work$/,
  /^\/api\/v2\/collections(\/[^/]+)?$/,
  /^\/api\/v2\/(groups|users|rbac\/roles)$/,
  /^\/api\/v2\/courses\/[^/]+\/learner-state$/,
  /^\/api\/v2\/(courses\/[^/]+\/discussions|discussions\/[^/]+\/replies)$/,
  // «Сдать» rereads the open draft: another tab or device may have saved since (B-ATT-16).
  /^\/api\/v2\/submissions\/[^/]+$/,
]

const failures = new WeakMap<Page, ExpectedFailure[]>()
const watched = new WeakMap<BrowserContext, Map<Page, string[]>>()

/** Declare a negative scenario's endpoint and statuses; 0 means an intentionally aborted request. */
export function expectFailure(page: Page, path: RegExp, ...statuses: number[]): void {
  failures.set(page, [...(failures.get(page) ?? []), { path, statuses }])
}

function expectedFailure(page: Page, url: string, status: number): boolean {
  return matchesFailure(failures.get(page) ?? [], url, status)
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
    if (LIVE_READS.some(live => live.test(pathname))) return
    // The event stream reconnects after a refusal (429: the user's 5 streams are open in parallel tests), by design.
    const reconnect = pathname === '/api/v2/me/events' && outcome.get(request.url()) !== '200'
    if (requested.has(request.url()) && !reconnect)
      problems.push(`duplicate GET ${request.url()} (first: ${outcome.get(request.url())})`)
    requested.add(request.url())
  })
  // How the first read ended: a retried network failure or 5xx reads differently from a second fetch by the app.
  const outcome = new Map<string, string>()
  page.on('response', response => {
    const status = response.status()
    outcome.set(response.url(), String(status))
    if (status >= 400 && !expectedFailure(page, response.url(), status))
      problems.push(`unexpected HTTP ${status} ${response.request().method()} ${response.url()}`)
  })
  page.on('requestfailed', request => outcome.set(request.url(), request.failure()?.errorText ?? 'failed'))
  page.on('console', message => {
    // HTTP failures are checked above with their endpoint and exact status.
    const resource = /^Failed to load resource: the server responded with a status of \d+/.test(message.text())
    const expectedNetwork =
      message.text().startsWith('Failed to load resource: net::') &&
      message.location().url.startsWith('http') &&
      expectedFailure(page, message.location().url, 0)
    if (message.type() === 'error' && !resource && !expectedNetwork) problems.push(`console: ${message.text()}`)
  })
  page.on('pageerror', error => problems.push(`page error: ${error.message}`))
  page.on('crash', () => problems.push(`page crashed on ${page.url()}`))
  // Against a built server (E2E_BASE_URL) every document carries the CSP the violations above are checked against.
  page.on('response', response => {
    const document = response.request().isNavigationRequest() && response.frame() === page.mainFrame()
    const headers = response.headers()
    const html = headers['content-type']?.startsWith('text/html')
    if (document && html && process.env['E2E_BASE_URL'] && response.ok() && !headers['content-security-policy'])
      problems.push(`no Content-Security-Policy on ${new URL(response.url()).pathname}`)
  })
}

async function inspect(page: Page, problems: string[]): Promise<void> {
  // The checks judge the hydrated page: an SSR form keeps its controls disabled (faded) until then.
  await page.waitForLoadState('load')
  await page.waitForFunction(() => !document.querySelector('[data-hydrating]'), null, { timeout: 10_000 })
  // The cursor leaves the page first: a resize slides other links under a parked cursor, and their hover preload
  // re-reads what may be gone by now (fixture teardown already deleted the test's courses): a duplicate 404 GET.
  await page.mouse.move(-1, -1)
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
  // Contrast measured mid-fade (a tooltip opening on focus) is not the page's contrast: let transitions end first.
  await page.evaluate(() => Promise.allSettled(document.getAnimations().map(animation => animation.finished)))
  // Axe last: it opens and closes a helper page in the context, after which WebKit (Windows) answered the next
  // command on this page with "Target page, context or browser has been closed" although the page was open.
  const axe = await new AxeBuilder({ page }).analyze()
  for (const violation of axe.violations) {
    if (violation.impact === 'serious' || violation.impact === 'critical') {
      const nodes = violation.nodes.map(node => node.target.join(' ')).join(', ')
      problems.push(`axe ${violation.impact}: ${violation.id} at ${nodes} ${violation.helpUrl}`)
    }
  }
}

/** Check a transient dialog/menu while it is open, before the test dismisses it. */
export async function inspectPage(page: Page): Promise<void> {
  const problems: string[] = []
  await inspect(page, problems)
  expect(problems, `page health on ${page.url()}`).toEqual([])
}

export const test = base.extend({
  page: async ({ page, context }, use, info) => {
    await use(page)
    if (info.status === 'passed') await finishPages(context)
  },
  context: async ({ context }, use, info) => {
    const pages = new Map<Page, string[]>()
    watched.set(context, pages)
    const attach = (page: Page) => {
      if (pages.has(page)) return
      const problems: string[] = []
      pages.set(page, problems)
      watch(page, problems)
    }
    context.on('page', attach)
    for (const page of context.pages()) attach(page)
    await context.exposeBinding('reportCspViolation', ({ page }, violation: string) => {
      pages.get(page)?.push(`CSP violation: ${violation}`)
    })
    await context.addInitScript(() => {
      document.addEventListener('securitypolicyviolation', event => {
        void Reflect.get(window, 'reportCspViolation')(`${event.violatedDirective} blocked ${event.blockedURI}`)
      })
    })
    await use(context)
    if (info.status === 'passed') await finishPages(context)
  },
})

/** Cleanup deletes a course with the learner work the test made: the server wants that acknowledged. */
export const withLearnerWork = { acknowledge_learner_work: true } as const

/** Inspect before deleting test data, then stop live readers before cleanup emits events. */
export async function finishPages(context: BrowserContext): Promise<void> {
  for (const page of context.pages()) {
    if (page.isClosed() || !page.url().startsWith('http')) continue
    await inspectPage(page)
  }
  for (const problems of watched.get(context)?.values() ?? []) {
    expect(problems, 'page health (e2e/fixtures/test.ts)').toEqual([])
  }
  for (const page of context.pages()) {
    if (!page.isClosed() && page.url().startsWith('http')) await page.goto('about:blank')
  }
}

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

const passes = (check: () => Promise<void>) =>
  check().then(
    () => true,
    () => false,
  )

/**
 * Clicks until `outcome` holds: a click before hydration (SSR page) or under a view transition does nothing. After a
 * click the outcome is checked before the next one: an answer that came late already acted, and a toggle (like) or a
 * target gone with it must not be clicked again.
 */
export async function clickUntil(target: Locator, outcome: () => Promise<void>): Promise<void> {
  let clicked = false
  await expect(async () => {
    if (clicked && (await passes(outcome))) return
    if (await target.isVisible()) clicked = await target.click({ timeout: 1000 }).then(() => true)
    await outcome()
  }).toPass()
}
