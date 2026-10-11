// ROUND3-17: a missing course / lesson / collection / profile answers HTTP 404. The proxy asks the API before the
// page streams (a streamed shell commits the response to 200) and rewrites to an unmatched path.
import { NextRequest } from 'next/server'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'

import { isMissingResource, resourceProbe } from '@/lib/missing-resource'
import { proxy } from '@/proxy'

const json = (status: number, body: unknown = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

describe('resourceProbe', () => {
  it('maps the public detail pages to their API read and ignores everything else', () => {
    expect(resourceProbe('/course/c1')).toEqual({ kind: 'course', apiPath: 'courses/c1' })
    expect(resourceProbe('/course/course_c1/activity/activity_a1')).toEqual({
      kind: 'activity',
      apiPath: 'activities/a1',
      courseId: 'c1',
      activityId: 'a1',
    })
    expect(resourceProbe('/collection/k1/')).toEqual({ kind: 'collection', apiPath: 'collections/k1' })
    expect(resourceProbe('/user/aliya')).toEqual({ kind: 'user', apiPath: 'users/aliya' })
    for (const other of ['/courses', '/course/c1/edit', '/dash/courses/c1', '/'])
      expect(resourceProbe(other)).toBeNull()
  })
})

describe('isMissingResource', () => {
  const base = 'http://api.test/api/v2/'

  it('is missing on 404 and 422 only, failing open on anything else', async () => {
    const probe = resourceProbe('/course/c1')!
    for (const [status, missing] of [
      [404, true],
      [422, true],
      [200, false],
      [403, false],
      [500, false],
    ] as const) {
      expect(await isMissingResource(probe, base, null, async () => json(status))).toBe(missing)
    }
    expect(await isMissingResource(probe, base, null, () => Promise.reject(new Error('down')))).toBe(false)
  })

  it('forwards the session cookie and keeps a scheduled test reachable', async () => {
    const probe = resourceProbe('/course/c1/activity/a1')!
    const calls: [string, RequestInit][] = []
    const fetchImpl = async (url: string, init: RequestInit) => {
      calls.push([url, init])
      return url.endsWith('activities/a1')
        ? json(404)
        : json(200, { outline: [{ activities: [{ id: 'a1', blocked_reason: 'scheduled' }] }] })
    }
    expect(await isMissingResource(probe, base, 'ab_session=s', fetchImpl)).toBe(false)
    expect(calls.map(([url]) => url)).toEqual([`${base}activities/a1`, `${base}courses/c1/learner-state`])
    expect((calls[0]![1].headers as Record<string, string>).cookie).toBe('ab_session=s')
  })
})

describe('proxy', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('rewrites a missing course to an unmatched path with the card headers', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json(404)),
    )
    const response = await proxy(new NextRequest('http://localhost:3000/ru/course/c1'))
    expect(response.headers.get('x-middleware-rewrite')).toBe('http://localhost:3000/ru-RU/course/c1/__missing')
    expect(response.headers.get('x-middleware-request-x-missing-resource')).toBe('course')
    expect(response.headers.get('x-middleware-request-x-missing-guest')).toBe('1')
  })

  it('leaves an existing course and prefetches alone', async () => {
    const fetchMock = vi.fn(async () => json(200))
    vi.stubGlobal('fetch', fetchMock)
    const ok = await proxy(new NextRequest('http://localhost:3000/ru/course/c1'))
    expect(ok.headers.get('x-middleware-rewrite') ?? '').not.toContain('__missing')
    fetchMock.mockClear()
    await proxy(new NextRequest('http://localhost:3000/ru/course/c1', { headers: { 'next-router-prefetch': '1' } }))
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
