import { describe, expect, it, vi } from 'vite-plus/test'

import { getPageParam } from '@/lib/search-params'

const { apiJson } = vi.hoisted(() => ({ apiJson: vi.fn() }))
vi.mock('@/lib/api-client', () => ({ apiJson }))

import { getCourses } from '@services/courses/courses'

describe('catalog paging', () => {
  // UX-275: /ru?page=-1 rendered «Пока нет курсов» - the cursor walk never ran.
  it('reads a missing, junk, zero or negative ?page= as page 1', () => {
    expect(getPageParam({})).toBe(1)
    expect(getPageParam({ page: 'abc' })).toBe(1)
    expect(getPageParam({ page: '0' })).toBe(1)
    expect(getPageParam({ page: '-1' })).toBe(1)
    expect(getPageParam({ page: ['3', '4'] })).toBe(3)
  })

  // UX-274: in-progress-first is the server's keyset order, on every cursor hop.
  it('asks the server for the progress order on every page hop', async () => {
    apiJson
      .mockResolvedValueOnce({ items: [], next_cursor: 'c1' })
      .mockResolvedValueOnce({ items: [], next_cursor: null })
    await getCourses(undefined, 2, 20, 'progress')
    expect(apiJson.mock.calls.map(([path]) => path)).toEqual([
      'courses?limit=20&sort=progress',
      'courses?limit=20&sort=progress&cursor=c1',
    ])
  })
})
