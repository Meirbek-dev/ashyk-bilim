import type { Page } from '@playwright/test'

import { m } from '#/paraglide/messages'

import { expectFailure } from '../fixtures/test'

import { expect, ru, test } from './attempt-fixture'

// The service worker (src/shared/pwa, REWRITE 7.8) against the production build. The rest of the suite blocks service
// workers (playwright.config.ts): `page.route` does not see requests a worker answers.
test.use({ serviceWorkers: 'allow' })
test.describe.configure({ timeout: 90_000 })

const status = (page: Page) => page.getByRole('banner').locator('output')

/** The worker installed, activated and controls the page. */
async function controlled(page: Page) {
  await page.evaluate(async () => navigator.serviceWorker.ready)
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
}

/** The attempts the worker holds in IndexedDB; 0 before it created its database (opening it here would create it). */
const queued = (page: Page) =>
  page.evaluate(async () => {
    if (!(await indexedDB.databases()).some(db => db.name === 'ab-sw')) return 0
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('ab-sw')
      request.addEventListener('success', () => resolve(request.result))
      request.addEventListener('error', () => reject(request.error ?? new Error('IndexedDB')))
    })
    const count = await new Promise<number>((resolve, reject) => {
      const request = db.transaction('drafts').objectStore('drafts').count()
      request.addEventListener('success', () => resolve(request.result))
      request.addEventListener('error', () => reject(request.error ?? new Error('IndexedDB')))
    })
    db.close()
    return count
  })

test('the shell is precached and served from the cache; pages and the API never are', async ({ page, context }) => {
  await page.goto('/')
  await controlled(page)
  const cached = await page.evaluate(async () => {
    const name = (await caches.keys()).find(key => key.startsWith('ab-assets-'))
    const cache = name ? await caches.open(name) : null
    return cache ? (await cache.keys()).map(request => new URL(request.url).pathname) : []
  })
  expect(cached.some(path => /^\/assets\/index-[\w-]+\.js$/.test(path))).toBe(true)
  expect(cached.every(path => path.startsWith('/assets/'))).toBe(true)
  await context.setOffline(true)
  await expect(page.goto('/')).rejects.toThrow(/ERR_INTERNET_DISCONNECTED/)
  await context.setOffline(false)
})

test('an exam answer saved offline and left behind reaches the server from the worker', async ({
  page,
  context,
  learner,
  makeQuiz,
  attempts,
}) => {
  const quiz = await makeQuiz()
  await learner.enroll(quiz.course)
  await learner.signIn()
  await page.goto(quiz.url)
  await page.getByRole('button', { name: m.attempt_start({}, ru) }).click()
  await expect(page).toHaveURL(/[?&]attempt=/)
  await controlled(page)
  await expect(page.locator('.ab-prose').getByText('Выберите город.')).toBeVisible()
  // The worker answers a save the network refused with a network error (the page keeps its queue).
  expectFailure(page, /^\/api\/v2\/submissions\/[^/]+\/draft$/, 0)
  await context.setOffline(true)
  await page.getByRole('radio', { name: 'Алматы' }).check()
  await expect(status(page)).toHaveText(m.attempt_offline({}, ru))
  await expect.poll(() => queued(page)).toBe(1)
  // The learner closes the exam while offline; later, online, any page of the site wakes the worker.
  await page.close()
  await context.setOffline(false)
  const home = await context.newPage()
  await home.goto('/')
  await expect.poll(async () => (await attempts(quiz))[0]?.answered_count, { timeout: 20_000 }).toBe(1)
  await expect.poll(() => queued(home)).toBe(0)
})
