import { onlineManager } from '@tanstack/react-query'
import { expect, test } from 'vite-plus/test'

import { dashboardQueryKey, getCourseQueryKey, unreadCountQueryKey } from '#/shared/api/gen/@tanstack/react-query.gen'
import type { SessionInfo } from '#/shared/api/gen/types.gen'
import { sessionOptions } from '#/shared/auth/session'

import { ApiError } from './errors'
import { holdSession } from './held-session'
import { createQueryClient, releaseSessionHold } from './query-client'

const session = (userId: string): SessionInfo => ({
  user_id: userId,
  user: {
    id: userId,
    username: userId,
    display_name: userId,
    email: `${userId}@e2e.test`,
    locale: 'ru-RU',
    language: 'ru',
    email_verified: true,
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

const sessionExpired = () =>
  new ApiError({ status: 401, code: 'session-expired', fieldErrors: [], requestId: null, retryAfter: null })

test('a 401 while an upload is held keeps the page; once the last hold lets go, a 401 signs out again', async () => {
  let guards = 0
  const client = createQueryClient(async () => void (guards += 1))
  const key = sessionOptions().queryKey
  client.setQueryData(key, session('a'))
  const course = getCourseQueryKey({ path: { course_id: 'c' } })
  client.getQueryCache().build(client, { queryKey: course })
  const release = holdSession()
  // No background refetch meanwhile but the session's own: a public read would answer as a guest.
  const onFocus = client.getDefaultOptions().queries?.refetchOnWindowFocus
  const refetches = (queryKey: readonly unknown[]) =>
    typeof onFocus === 'function' && onFocus(client.getQueryCache().find({ queryKey, exact: true })!)
  expect(refetches(course)).toBe(false)
  expect(refetches(key)).toBe(true)
  await client
    .query({ queryKey: dashboardQueryKey(), queryFn: () => Promise.reject(sessionExpired()) })
    .catch(() => undefined)
  expect(client.getQueryData(key)?.user_id).toBe('a')
  expect(guards).toBe(0)
  // Read again on the next focus: the user may have signed in in another tab.
  expect(client.getQueryState(key)?.isInvalidated).toBe(true)
  releaseSessionHold(client, release)
  expect(refetches(course)).toBe(true)
  await client
    .query({ queryKey: unreadCountQueryKey(), queryFn: () => Promise.reject(sessionExpired()) })
    .catch(() => undefined)
  expect(client.getQueryData(key)).toBeNull()
  expect(guards).toBe(1)
})

test('clearing the cache (the SSR teardown after the response) or collecting the session is not a sign-out', () => {
  let guards = 0
  const client = createQueryClient(async () => void (guards += 1))
  const key = sessionOptions().queryKey
  client.setQueryData(key, session('a'))
  client.clear()
  expect(guards).toBe(0)
  // Read again later: the same account is no change, an anonymous answer is a sign-out.
  client.setQueryData(key, session('a'))
  expect(guards).toBe(0)
  client.setQueryData(key, null)
  expect(guards).toBe(1)
})

const offline = () => Promise.reject(new TypeError('Failed to fetch'))

test('offline, a save and a read fail at once (an error to show) instead of waiting paused for the network', async () => {
  onlineManager.setOnline(false)
  try {
    const queryClient = createQueryClient(async () => {})
    const save = queryClient.getMutationCache().build(queryClient, { mutationFn: offline })
    await expect(save.execute(undefined)).rejects.toThrow('Failed to fetch')
    const read = { queryKey: unreadCountQueryKey(), queryFn: offline, retry: false }
    await expect(queryClient.query(read)).rejects.toThrow('Failed to fetch')
  } finally {
    onlineManager.setOnline(true)
  }
})
