import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'

/**
 * Readiness is server-side (`GET courses/{id}/readiness`): the service maps
 * the `{ready, blockers, warnings}` payload onto the review page's issue list
 * with studio links for activity-scoped codes. The old client-side derivation
 * from the curriculum is gone.
 */

const mocks = vi.hoisted(() => ({ apiJson: vi.fn(), apiResult: vi.fn() }))
vi.mock('@/lib/api-client', () => ({ apiJson: mocks.apiJson, apiResult: mocks.apiResult }))
vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }))
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) => `${key}:${values?.title ?? ''}`,
}))
vi.mock('@services/config/config', () => ({ getAPIUrl: () => 'http://api.test/api/v2' }))

import { getCourseReadiness } from '@services/courses/readiness'

const courseId = '01a08bfb-2c9b-71b3-8985-d541d2b1716b'
const activityId = '01a08bfb-2c9b-71b3-8985-d541d2b1716c'

describe('getCourseReadiness', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.apiJson.mockImplementation(async (_path: string, _init: unknown, parse?: (data: unknown) => unknown) => {
      const wire = {
        ready: false,
        blockers: [
          { code: 'no-live-activity', activity_id: null, title: null },
          { code: 'file-submission-unpublished', activity_id: activityId, title: 'Essay' },
        ],
        warnings: [{ code: 'thumbnail-missing' }],
      }
      return parse ? parse(wire) : wire
    })
  })

  it('reads the server verdict and links issues to the studio or the workspace stage', async () => {
    const readiness = await getCourseReadiness(`course_${courseId}`)

    expect(mocks.apiJson.mock.calls[0]?.[0]).toBe(`courses/${courseId}/readiness`)
    expect(readiness.ready).toBe(false)
    expect(readiness.issues).toEqual([
      {
        code: 'no-live-activity',
        severity: 'blocker',
        activity_id: null,
        title: null,
        path: `/dash/courses/${courseId}/curriculum`,
      },
      {
        code: 'file-submission-unpublished',
        severity: 'blocker',
        activity_id: activityId,
        title: 'Essay',
        path: `/dash/courses/${courseId}/activity/${activityId}/studio`,
      },
      {
        code: 'thumbnail-missing',
        severity: 'warning',
        activity_id: null,
        title: null,
        path: `/dash/courses/${courseId}/details`,
      },
    ])
    // No curriculum walk any more.
    expect(mocks.apiJson.mock.calls.some(call => String(call[0]).includes('curriculum'))).toBe(false)
  })
})

// UX-137: the review page keeps «Исправить» after a blocker is fixed in
// another tab; the client disables focus refetch globally, so the readiness
// query opts back in and is always stale when the teacher returns.
describe('courseReadinessQueryOptions', () => {
  it('refetches on window focus', async () => {
    const { courseReadinessQueryOptions } = await import('@components/Dashboard/Courses/courseWorkflowUi')
    const options = courseReadinessQueryOptions(courseId)
    expect(options.refetchOnWindowFocus).toBe(true)
    expect(options.staleTime).toBe(0)
  })
})

// BUG-219: a published config with blank instructions is its own code, told
// apart from an unpublished one.
describe('useReadinessIssueMessage', () => {
  it('localizes file-submission-not-ready separately from -unpublished', async () => {
    const { useReadinessIssueMessage } = await import('@components/Dashboard/Courses/courseWorkflowUi')
    const { renderHook } = await import('@testing-library/react')
    const { result } = renderHook(() => useReadinessIssueMessage())
    const issue = { severity: 'blocker' as const, activity_id: activityId, title: 'Essay', path: '' }
    expect(result.current({ ...issue, code: 'file-submission-not-ready' })).toBe('fileSubmissionUnready:Essay')
    expect(result.current({ ...issue, code: 'file-submission-unpublished' })).toBe('fileSubmissionUnpublished:Essay')
  })
})
