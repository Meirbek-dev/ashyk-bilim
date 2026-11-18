import { QueryClient } from '@tanstack/react-query'
import { afterEach, expect, test, vi } from 'vite-plus/test'

import type { Usergroup } from '#/shared/api/gen/types.gen'

import { courseGroupsOptions, linkGroupsOptions } from './queries'

const COURSE = '0190a5d2-0000-7000-8000-000000000010'

const group = (n: number): Usergroup => ({
  allowed_actions: ['manage_courses'],
  can_write: true,
  created_at_unix: 0,
  created_by: null,
  description: '',
  id: `0190a5d2-0000-7000-8000-00000000000${n}`,
  member_count: 0,
  name: `Group ${n}`,
  updated_at_unix: 0,
  version: 1,
})

afterEach(() => vi.unstubAllGlobals())

test('a partly failed link keeps the groups that linked in the cache and reports the failure', async () => {
  const [kept, linked, refused] = [group(1), group(2), group(3)]
  vi.stubGlobal(
    'fetch',
    vi.fn(async (request: Request) =>
      request.url.includes(refused.id)
        ? new Response(JSON.stringify({ code: 'forbidden', status: 403 }), {
            status: 403,
            headers: { 'content-type': 'application/problem+json' },
          })
        : new Response(null, { status: 204 }),
    ),
  )
  const queryClient = new QueryClient()
  queryClient.setQueryData(courseGroupsOptions(COURSE).queryKey, [kept])

  await expect(linkGroupsOptions(queryClient, COURSE).mutationFn([linked, refused])).rejects.toBeDefined()

  expect(queryClient.getQueryData(courseGroupsOptions(COURSE).queryKey)?.map(g => g.id)).toEqual([kept.id, linked.id])
})
