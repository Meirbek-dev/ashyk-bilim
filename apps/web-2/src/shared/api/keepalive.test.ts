import { afterEach, expect, test, vi } from 'vite-plus/test'

import { ApiError } from './errors'
import { sendOnLeave } from './keepalive'

afterEach(() => vi.unstubAllGlobals())

test('B-ATT-29 a leaving save calls fetch within the event, with keepalive, and rejects a refusal with its ApiError', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({ ok: true }))
  vi.stubGlobal('fetch', fetch)
  const sent = sendOnLeave('/api/v2/submissions/s/draft', 'PATCH', { last: true }, { 'If-Match': '3' })
  // Before any await: a closing page runs no later task.
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(fetch).toHaveBeenCalledWith('/api/v2/submissions/s/draft', {
    method: 'PATCH',
    keepalive: true,
    headers: { 'Content-Type': 'application/json', 'If-Match': '3' },
    body: '{"last":true}',
  })
  await expect(sent).resolves.toEqual({ ok: true })
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof globalThis.fetch>(async () => new Response('{}', { status: 429, headers: { 'retry-after': '40' } })),
  )
  const refused = await sendOnLeave('/x', 'PATCH', {}).catch((error: unknown) => error)
  expect(refused).toBeInstanceOf(ApiError)
  expect(refused instanceof ApiError && refused.retryAfter).toBe(40)
})
