import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { m } from '#/paraglide/messages'
import { availableWorkspaces, requiredCapabilities, visibleSections } from '#/shared/auth/access'

import { expect, type Role, type Seed, test } from '../fixtures/seed'

// The role matrix of spec 9: every role visits every route of the tree (5.3). The expected outcome comes from the
// route's guard group in the tree and from the same access table the guards and the navigation read (7.5).

const ru = { locale: 'ru' } as const
const ROLES: Role[] = ['guest', 'student', 'teacher', 'admin']

type Outcome = 'renders' | 'login' | 'home' | 'forbidden'
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

function withParams(path: string, params: Seed['params']): string {
  const values = new Map(Object.entries(params))
  return path.replaceAll(/\$(\w+)/g, (_, name: string) => values.get(name) ?? name)
}

function expected(leaf: Leaf, role: Role, seed: Seed): Outcome {
  if (leaf.group === '_public') return 'renders'
  if (leaf.group === '_guest') return role === 'guest' ? 'renders' : 'home'
  if (role === 'guest') return 'login'
  // An object's page guarded by its `allowed_actions` (7.5): the seed reads them for each role.
  if (leaf.id === '/_authed/collections/$collectionId/edit') {
    return seed.collectionActions[role].includes('update') ? 'renders' : 'forbidden'
  }
  // The player, the course summary and the attempt: the enrolled learner only (the loader reads the learner state).
  const learnerOnly = ['$activityId', 'complete', '$activityId_/attempt'].map(
    tail => `/_authed/learn/$courseId/${tail}`,
  )
  if (learnerOnly.includes(leaf.id)) {
    return seed.enrolled[role] ? 'renders' : 'forbidden'
  }
  const held = seed.accounts[role].session.capabilities
  return requiredCapabilities(leaf.path).every(capability => held.includes(capability)) ? 'renders' : 'forbidden'
}

const leaves = leafRoutes()

test('the matrix covers the whole route tree of spec 5.3', () => {
  expect(leaves.length).toBeGreaterThan(50)
  expect(new Set(leaves.map(leaf => leaf.group))).toEqual(new Set(['_public', '_guest', '_authed']))
})

for (const role of ROLES) {
  for (const leaf of leaves) {
    test(`${role} visits ${leaf.id}`, async ({ page, seed, signInAs }) => {
      await signInAs(role)
      const path = withParams(leaf.path, seed.params)
      await page.goto(path)
      const outcome = expected(leaf, role, seed)
      const forbidden = page.getByRole('heading', { name: m.platform_forbidden_title({}, ru) })
      if (outcome === 'login') {
        await expect(page).toHaveURL(/\/login\?redirect=/)
      } else if (outcome === 'home') {
        await expect(page).toHaveURL(/\/home$/)
      } else if (outcome === 'forbidden') {
        await expect(forbidden).toBeVisible()
        expect(new URL(page.url()).pathname).toBe(path)
      } else {
        await expect(page.getByRole('main')).toBeVisible()
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
