import { describe, expect, it, vi } from 'vite-plus/test'

const mocks = vi.hoisted(() => ({ apiResult: vi.fn(async (_path: string) => ({ data: [] as unknown[], status: 200, headers: {} as Record<string, string> })) }))
vi.mock('@/lib/api-client', () => ({ apiResult: mocks.apiResult }))

import { getCourseEditorBundle } from '@services/courses/editor'

describe('getCourseEditorBundle', () => {
  it('reads usergroups and certifications from the v2 course sub-resources without an entity prefix', async () => {
    await getCourseEditorBundle('course_abc')
    const paths = mocks.apiResult.mock.calls.map(c => c[0])
    expect(paths).toContain('courses/abc/usergroups')
    expect(paths).toContain('courses/abc/certifications')
    expect(paths.some(p => String(p).includes('course_'))).toBe(false)
  })

  it('reads the contributor roster from `courses/{id}/contributors`', async () => {
    mocks.apiResult.mockClear()
    const bundle = await getCourseEditorBundle('abc')
    const paths = mocks.apiResult.mock.calls.map(c => String(c[0]))
    expect(paths).toContain('courses/abc/contributors')
    expect(bundle.contributors).toMatchObject({ available: true, error: null, data: [] })
  })
})
