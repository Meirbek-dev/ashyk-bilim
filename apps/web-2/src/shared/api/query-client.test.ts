import { expect, test } from 'vite-plus/test'

import type { SessionInfo } from '#/shared/api/gen/types.gen'
import { sessionOptions } from '#/shared/auth/session'

import { createQueryClient } from './query-client'

const session = (userId: string): SessionInfo => ({
  user_id: userId,
  user: {
    id: userId,
    username: userId,
    display_name: userId,
    email: `${userId}@e2e.test`,
    locale: 'ru-RU',
    language: 'ru',
    avatar_key: null,
    theme: null,
  },
  roles: [],
  permissions: [],
  capabilities: [],
  mfa_enabled: false,
})

test('another account in the session re-runs the guards and drops the previous account’s data', () => {
  let guards = 0
  const client = createQueryClient(async () => void (guards += 1))
  const key = sessionOptions().queryKey
  client.setQueryData(key, session('a'))
  client.setQueryData(['courses'], ['mine'])
  expect(guards).toBe(0)
  client.setQueryData(key, session('b'))
  expect(guards).toBe(1)
  expect(client.getQueryData(['courses'])).toBeUndefined()
  expect(client.getQueryData(key)?.user_id).toBe('b')
  // Signing out re-runs them too; the same account refetched does not.
  client.setQueryData(key, session('b'))
  client.setQueryData(key, null)
  expect(guards).toBe(2)
})
