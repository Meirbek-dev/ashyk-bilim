import { describe, expect, test } from 'vite-plus/test'

import { ApiError } from '#/shared/api/errors'
import type { SessionInfo } from '#/shared/api/gen/types.gen'

import { hasCapability, requireCapability } from './access'

const session: SessionInfo = {
  user_id: '00000000-0000-0000-0000-000000000001',
  user: {
    id: '00000000-0000-0000-0000-000000000001',
    username: 'teacher',
    display_name: 'Teacher',
    email: 'teacher@e2e.test',
    locale: 'ru',
  },
  roles: ['admin'],
  permissions: ['*:*:*'],
  capabilities: ['teach'],
  mfa_enabled: false,
}

describe('access', () => {
  test('reads capabilities only; roles and permission strings grant nothing', () => {
    expect(hasCapability(session, 'teach')).toBe(true)
    expect(hasCapability(session, 'admin')).toBe(false)
    expect(hasCapability(null, 'teach')).toBe(false)
  })

  test('a missing capability is a 403 shown in place', () => {
    expect(() => requireCapability('admin')({ context: { session } })).toThrow(ApiError)
    expect(() => requireCapability('teach')({ context: { session } })).not.toThrow()
  })
})
