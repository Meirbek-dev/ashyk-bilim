import { describe, expect, test } from 'vite-plus/test'

import { ApiError } from '#/shared/api/errors'
import type { Capability, SessionInfo } from '#/shared/api/gen/types.gen'

import {
  availableWorkspaces,
  hasCapability,
  requireCapability,
  requiredCapabilities,
  shellWorkspace,
  visibleSections,
  workspaceHome,
  workspaceOf,
  workspaces,
} from './access'

const sessionWith = (capabilities: Capability[]): SessionInfo => ({
  user_id: '00000000-0000-0000-0000-000000000001',
  user: {
    id: '00000000-0000-0000-0000-000000000001',
    username: 'teacher',
    display_name: 'Teacher',
    email: 'teacher@e2e.test',
    locale: 'ru-RU',
    language: 'ru',
    avatar_key: null,
    theme: null,
  },
  roles: ['admin'],
  permissions: ['*:*:*'],
  capabilities,
  mfa_enabled: false,
})

const teacher = sessionWith(['teach'])
const guard = (pathname: string, session: SessionInfo | null) => () =>
  requireCapability({ context: { session }, location: { pathname } })

describe('access', () => {
  test('reads capabilities only; roles and permission strings grant nothing', () => {
    expect(hasCapability(teacher, 'teach')).toBe(true)
    expect(hasCapability(teacher, 'admin')).toBe(false)
    expect(hasCapability(null, 'teach')).toBe(false)
  })

  test.each([
    ['/home', 'learn'],
    ['/courses/1/about', 'learn'],
    ['/teach', 'teach'],
    ['/teach/courses/1/activities/2/edit', 'teach'],
    ['/teacher', 'learn'],
    ['/admin/users', 'admin'],
  ])('%s belongs to the %s workspace', (pathname, id) => {
    expect(workspaceOf(pathname).id).toBe(id)
  })

  test('the shell keeps Learn on a workspace the user cannot open (the 403 page still has navigation)', () => {
    expect(shellWorkspace(teacher, '/admin/users').id).toBe('learn')
    expect(shellWorkspace(teacher, '/teach/courses').id).toBe('teach')
    expect(shellWorkspace(null, '/courses').id).toBe('learn')
  })

  test.each([
    ['/home', []],
    ['/teach', ['teach']],
    ['/teach/courses/1/gradebook', ['teach']],
    ['/teach/analytics/learners', ['teach', 'analytics.view']],
    ['/teach/groups', ['teach', 'groups.manage']],
    ['/admin', ['admin']],
    ['/admin/roles', ['admin', 'admin.roles']],
  ])('%s needs %j', (pathname, capabilities) => {
    expect(requiredCapabilities(pathname)).toEqual(capabilities)
  })

  test('a missing capability is a 403 shown in place; the guard reads the same table', () => {
    expect(guard('/admin/users', teacher)).toThrow(ApiError)
    expect(guard('/teach/analytics/overview', teacher)).toThrow(ApiError)
    expect(guard('/teach/courses', teacher)).not.toThrow()
    expect(guard('/home', teacher)).not.toThrow()
  })

  test('navigation shows only what the guard lets through', () => {
    const admin = sessionWith(['teach', 'admin', 'admin.roles', 'analytics.view'])
    for (const workspace of workspaces) {
      for (const section of visibleSections(admin, workspace)) {
        expect(guard(section.to, admin)).not.toThrow()
      }
      for (const section of workspace.sections.filter(entry => !visibleSections(admin, workspace).includes(entry))) {
        expect(guard(section.to, admin)).toThrow(ApiError)
      }
    }
  })

  test('workspaces: learn for every session, the others by capability; none for a guest', () => {
    expect(availableWorkspaces(null)).toEqual([])
    expect(availableWorkspaces(sessionWith([])).map(workspace => workspace.id)).toEqual(['learn'])
    expect(availableWorkspaces(sessionWith(['teach', 'admin'])).map(workspace => workspace.id)).toEqual([
      'learn',
      'teach',
      'admin',
    ])
  })

  test('a workspace opens on its first allowed section, or is a 403 without one', () => {
    expect(workspaceHome(sessionWith(['admin', 'admin.ai']), 'admin')).toBe('/admin/ai')
    expect(workspaceHome(teacher, 'teach')).toBe('/teach')
    expect(() => workspaceHome(teacher, 'admin')).toThrow(ApiError)
  })
})
