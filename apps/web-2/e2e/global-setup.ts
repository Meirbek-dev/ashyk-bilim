import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { chromium, type FullConfig, type Page } from '@playwright/test'

import { createClient, createConfig } from '#/shared/api/gen/client'
import { login } from '#/shared/api/gen/sdk.gen'

// Against `vp dev` only (no E2E_BASE_URL): the first request of a route compiles it (SSR and the client chunks) and
// may re-optimize dependencies with a full reload, which costs a cold test its 5 s budget. One signed-in pass over
// every route of the tree compiles them all before the specs start, so no spec needs a longer timeout.

const PLACEHOLDER = '00000000-0000-4000-8000-000000000000'
const PARALLEL = 6

/** Leaf paths of src/routeTree.gen.ts with a placeholder for each param (the route's chunks load either way). */
function routePaths(): string[] {
  const tree = readFileSync(resolve(import.meta.dirname, '../src/routeTree.gen.ts'), 'utf8')
  const block = /export interface FileRoutesByFullPath \{([\s\S]*?)\n\}/.exec(tree)?.[1] ?? ''
  const paths = [...block.matchAll(/^\s+'([^']+)':/gm)].flatMap(match => (match[1] ? [match[1]] : []))
  return [...new Set(paths.map(path => path.replaceAll(/\$\w+/g, PLACEHOLDER)))]
}

const counted = (request: { url: () => string }) => !request.url().includes('/me/events')

/** Loads the page and waits until no request is in flight for 500 ms (the event stream does not count). */
async function settle(page: Page, url: string): Promise<void> {
  const traffic = { inflight: 0, quietSince: Date.now() }
  page.on('request', request => counted(request) && traffic.inflight++)
  const done = (request: { url: () => string }) => {
    if (!counted(request)) return
    traffic.inflight--
    traffic.quietSince = Date.now()
  }
  page.on('requestfinished', done)
  page.on('requestfailed', done)
  await page.goto(url, { waitUntil: 'load', timeout: 120_000 }).catch(() => undefined)
  const busy = () => traffic.inflight > 0 || Date.now() - traffic.quietSince < 500
  for (const deadline = Date.now() + 60_000; Date.now() < deadline && busy();) await page.waitForTimeout(100)
  page.removeAllListeners()
}

async function adminCookie(baseURL: string): Promise<{ name: string; value: string } | null> {
  const password = process.env['E2E_PASSWORD']
  if (!password) return null
  const { response } = await login({
    client: createClient(createConfig({ baseUrl: baseURL })),
    body: { login: 'e2e-admin', password },
  })
  const pair = /^([^=;]+)=([^;]*)/.exec(response?.headers.get('set-cookie') ?? '')
  return pair?.[1] && pair[2] !== undefined ? { name: pair[1], value: pair[2] } : null
}

export default async function warmDevServer(config: FullConfig): Promise<void> {
  if (process.env['E2E_BASE_URL']) return
  const baseURL = String(config.projects[0]?.use.baseURL)
  const browser = await chromium.launch()
  const context = await browser.newContext({ baseURL })
  const cookie = await adminCookie(baseURL)
  if (cookie) await context.addCookies([{ ...cookie, url: baseURL }])
  const queue = routePaths()
  const started = Date.now()
  await Promise.all(
    Array.from({ length: PARALLEL }, async () => {
      const page = await context.newPage()
      for (let path = queue.shift(); path !== undefined; path = queue.shift()) await settle(page, path)
      await page.close()
    }),
  )
  await browser.close()
  process.stdout.write(`dev server warmed in ${Math.round((Date.now() - started) / 1000)} s\n`)
}
