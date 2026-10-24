import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { m } from '#/paraglide/messages'
import { availableWorkspaces, requiredCapabilities, visibleSections } from '#/shared/auth/access'

import { expect, type Role, type Seed, test } from '../fixtures/seed'
import { expectFailure } from '../fixtures/test'

// The role matrix of spec 9: every role visits every route of the tree (5.3). The expected outcome comes from the
// route's guard group in the tree and from the same access table the guards and the navigation read (7.5).

const ru = { locale: 'ru' } as const
const ROLES: Role[] = ['guest', 'student', 'teacher', 'admin']

type Outcome = 'renders' | 'login' | 'home' | 'forbidden' | 'not-found' | 'missing-resource'
type Leaf = { id: string; group: string; path: string }

/** Leaf routes of src/routeTree.gen.ts: what a user can land on. Index routes are leaves even with siblings. */
function leafRoutes(): Leaf[] {
  const tree = readFileSync(resolve(import.meta.dirname, '../../src/routeTree.gen.ts'), 'utf8')
  const block = /export interface FileRoutesById \{([\s\S]*?)\n\}/.exec(tree)?.[1] ?? ''
  const ids = [...block.matchAll(/^\s+'([^']+)':/gm)].flatMap(match => (match[1] ? [match[1]] : []))
  const isLeaf = (id: string) => id.endsWith('/') || !ids.some(other => other.startsWith(`${id}/`))
  return ids.filter(isLeaf).map(id => {
    const segments = id.split('/').filter(segment => segment && !segment.startsWith('_'))
    return {
      id,
      group: id.split('/')[1] ?? '',
      path: `/${segments.map(segment => segment.replace(/_$/, '')).join('/')}`,
    }
  })
}

function withParams(path: string, seed: Seed, locale = 'ru'): string {
  const params = { ...seed.params }
  if (path.endsWith('/attempt')) params.activityId = seed.activities.quiz
  if (path.endsWith('/code')) params.activityId = seed.activities.code_challenge
  if (path.endsWith('/submission') || path.includes('/submissions/'))
    params.activityId = seed.activities.file_submission
  const values = new Map(Object.entries(params))
  values.set('locale', locale)
  // The splat (`/$`) takes every address no other route does: an unknown one stands for it.
  return path.replaceAll(/\$(\w*)/g, (_, name: string) => values.get(name) ?? (name || 'no-such-page'))
}

function expected(leaf: Leaf, role: Role, seed: Seed): Outcome {
  // An unknown address is «Страница не найдена» for everyone, the guest too (no sign-in first); old-web URLs it
  // redirects are covered by legacy-urls.test.ts.
  if (leaf.id === '/$') return 'not-found'
  if (leaf.group === '_public') return leaf.path.includes('$certificateId') ? 'missing-resource' : 'renders'
  if (leaf.group === '_guest') return role === 'guest' ? 'renders' : 'home'
  if (role === 'guest') return 'login'
  // An object's page guarded by its `allowed_actions` (7.5): the seed reads them for each role.
  if (leaf.id === '/_authed/collections/$collectionId/edit') {
    return seed.collectionActions[role].includes('update') ? 'renders' : 'forbidden'
  }
  // The player, the course summary, the file hand-in, the attempt and the code challenge: the enrolled learner and the
  // course's staff previewing it (the loader reads the learner state).
  const learnerOnly = [
    '$activityId',
    'complete',
    '$activityId_/submission',
    '$activityId_/attempt',
    '$activityId_/code',
  ].map(tail => `/_authed/learn/$courseId/${tail}`)
  if (learnerOnly.includes(leaf.id)) {
    return seed.opensPlayer[role] ? 'renders' : 'forbidden'
  }
  const held = seed.accounts[role].session.capabilities
  if (!requiredCapabilities(leaf.path).every(capability => held.includes(capability))) return 'forbidden'
  return leaf.path.includes('$submissionId') ? 'missing-resource' : 'renders'
}

const leaves = leafRoutes()

test('the matrix covers the whole route tree of spec 5.3', () => {
  expect(leaves.length).toBeGreaterThan(50)
  expect(new Set(leaves.map(leaf => leaf.group))).toEqual(new Set(['_public', '_guest', '_authed', '$']))
})

for (const role of ROLES) {
  for (const leaf of leaves) {
    test(`${role} visits ${leaf.id}`, async ({ page, seed, signInAs }) => {
      await signInAs(role)
      const path = withParams(leaf.path, seed)
      const outcome = expected(leaf, role, seed)
      if (outcome === 'not-found' || outcome === 'forbidden' || outcome === 'missing-resource') {
        expectFailure(page, new RegExp(`^${path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`), 403, 404)
      }
      if (outcome === 'missing-resource') {
        expectFailure(page, /^\/api\/v2\/(certificates|file-submission-attempts)\//, 404)
      }
      const response = await page.goto(path)
      const forbidden = page.getByRole('heading', { name: m.platform_forbidden_title({}, ru) })
      if (outcome === 'not-found') {
        expect(response?.status()).toBe(404)
        await expect(page.getByRole('heading', { name: m.platform_not_found_title({}, ru) })).toBeVisible()
        await expect(page).toHaveTitle(new RegExp(`^${m.platform_not_found_title({}, ru)} · `))
        expect(new URL(page.url()).pathname).toBe(path)
      } else if (outcome === 'missing-resource') {
        expect(response?.status()).toBe(404)
        const title = leaf.path.includes('$certificateId')
          ? m.certificates_not_found({}, ru)
          : m.grading_not_found({}, ru)
        await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible()
      } else if (outcome === 'login') {
        await expect(page).toHaveURL(/\/login\?redirect=/)
      } else if (outcome === 'home') {
        await expect(page).toHaveURL(/\/home$/)
      } else if (outcome === 'forbidden') {
        await expect(forbidden).toBeVisible()
        // The document says it too, not the name of the tab the link pointed at.
        await expect(page).toHaveTitle(new RegExp(`^${m.platform_forbidden_title({}, ru)} · `))
        expect(new URL(page.url()).pathname).toBe(path)
      } else {
        expect(response?.status(), `${role} ${path}`).toBe(200)
        await expect(page.getByRole('main')).toBeVisible()
        await expect(page.getByRole('heading', { name: m.platform_not_found_title({}, ru) })).toHaveCount(0)
        await expect(forbidden).toHaveCount(0)
        await expect(page).not.toHaveURL(/\/login\?redirect=/)
      }
    })
  }
}

for (const role of ['student', 'teacher', 'admin'] as const) {
  test(`${role} sees exactly the navigation the access table grants`, async ({ page, seed, signInAs }) => {
    await signInAs(role)
    const { session } = seed.accounts[role]
    const workspaces = availableWorkspaces(session)
    for (const workspace of workspaces) {
      const sections = visibleSections(session, workspace)
      await page.goto(sections[0]?.to ?? '/')
      const nav = page.getByRole('navigation', { name: m.platform_nav_label({}, ru) })
      await expect(nav.getByRole('link')).toHaveText(sections.map(section => section.label()))
      const switcher = page.getByRole('button', { name: new RegExp(`^${m.platform_workspace_label({}, ru)}`) })
      await expect(switcher).toHaveCount(workspaces.length > 1 ? 1 : 0)
    }
  })
}

/** Every message key: a raw key on screen means a text that was never translated. */
const messageKeys = Object.keys(m)

// kk and en smoke of every route (spec 9): each leaf as the first role that may see it.
for (const locale of ['kk', 'en'] as const) {
  for (const leaf of leaves) {
    test(`${locale} smoke of ${leaf.id}`, async ({ page, context, seed, signInAs, baseURL }) => {
      const role = (['admin', 'student', 'guest'] as const).find(each =>
        ['renders', 'not-found', 'missing-resource'].includes(expected(leaf, each, seed)),
      )
      expect(role, 'some role sees the route').toBeDefined()
      if (role) await signInAs(role)
      await context.addCookies([{ name: 'ab_locale', value: locale, url: String(baseURL) }])
      if (leaf.id === '/$') expectFailure(page, /^\/no-such-page$/, 404)
      const path = withParams(leaf.path, seed, locale)
      if (role && expected(leaf, role, seed) === 'missing-resource') {
        expectFailure(page, new RegExp(`^${path}$`), 404)
        expectFailure(page, /^\/api\/v2\/(certificates|file-submission-attempts)\//, 404)
      }
      await page.goto(path)
      await expect(page.locator('html')).toHaveAttribute('lang', locale)
      await expect(page.getByRole('main')).toBeVisible()
      const text = await page.locator('body').innerText()
      expect(messageKeys.filter(key => text.includes(key))).toEqual([])
    })
  }
}

test('the first Tab offers a skip past the shell straight to the page', async ({ page }) => {
  await page.goto('/courses')
  await page.waitForFunction(() => !document.querySelector('[data-hydrating]'))
  await page.keyboard.press('Tab')
  const skip = page.getByRole('link', { name: m.ui_skip_to_content({}, ru) })
  await expect(skip).toBeFocused()
  await expect(skip).toBeInViewport()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('main')).toBeFocused()
})

test('on a phone the bottom bar marks «Ещё» while a section behind it is open', async ({ page, signInAs }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await signInAs('admin')
  await page.goto('/admin/gamification')
  const bar = page.getByRole('navigation', { name: m.platform_nav_label({}, ru) })
  const more = bar.getByRole('button', { name: m.platform_nav_more({}, ru) })
  await expect(more).toHaveAttribute('aria-current', 'page')
  await page.goto('/admin/users')
  await expect(more).not.toHaveAttribute('aria-current', 'page')
})
