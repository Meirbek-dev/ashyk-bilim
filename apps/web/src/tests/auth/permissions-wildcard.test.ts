import { describe, expect, it, vi } from 'vite-plus/test'

// `permissions.ts` pulls in the server-only session module; stub it out.
vi.mock('@/lib/auth/session', () => ({ requireSession: vi.fn() }))
vi.mock('@/i18n/navigation', () => ({ redirect: vi.fn() }))
vi.mock('next-intl/server', () => ({ getLocale: vi.fn() }))

import { sessionCan } from '@/lib/auth/permissions'

describe('sessionCan super-admin wildcard', () => {
  it('honours the *:*:* grant the server actually issues', () => {
    // admin@ashyq.local logs in with permissions: ["*:*:*"] — nothing else.
    const session = { permissions: ['*:*:*'] }
    expect(sessionCan(session, 'platform', 'read', 'platform')).toBe(true)
    expect(sessionCan(session, 'course', 'delete', 'own')).toBe(true)
  })

  it('does not treat an explicit grant list as a wildcard', () => {
    const session = { permissions: ['course:read:all'] }
    expect(sessionCan(session, 'course', 'read', 'all')).toBe(true)
    expect(sessionCan(session, 'platform', 'read', 'platform')).toBe(false)
  })
})
