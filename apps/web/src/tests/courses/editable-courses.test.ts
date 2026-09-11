import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { getEditableCourses } from '@services/courses/editable'

/**
 * v2 has no `courses/editable/...` route (404 "no such route" took the whole
 * teacher "my courses" page down). The editable list is now derived from
 * `GET /courses` + the session's RBAC grants and `creator_id`, with the legacy
 * query / sort / preset / page filters applied client-side.
 */

const mocks = vi.hoisted(() => ({
  listCourses: vi.fn(),
  getSession: vi.fn(),
}))

vi.mock('@/lib/api/generated/courses/courses', () => ({ listCourses: mocks.listCourses }))
vi.mock('@/lib/auth/session', () => ({ getSession: mocks.getSession, requireSession: vi.fn() }))
vi.mock('@services/courses/courses', () => ({ getCourseMetadata: vi.fn() }))
vi.mock('@/i18n/navigation', () => ({ redirect: vi.fn() }))
vi.mock('next-intl/server', () => ({ getLocale: vi.fn(async () => 'ru') }))

const teacherId = '01a08bd6-a04f-76ac-92cd-4daaf9a31de7'
const otherId = '01a08bd6-a04f-70cc-bfc8-e6216333d3d4'
const NOW = Math.floor(Date.now() / 1000)

const course = (n: number, overrides: Record<string, unknown> = {}) => ({
  id: `0000000${n}-0000-4000-8000-000000000000`,
  name: `Course ${n}`,
  description: '',
  about: '',
  creator_id: teacherId,
  public: true,
  open_to_contributors: false,
  tags: [],
  created_at_unix: NOW - n * 100,
  updated_at_unix: NOW - n * 100,
  ...overrides,
})

const session = (permissions: string[]) => ({ userId: teacherId, roles: [], permissions, user: {} })

describe('getEditableCourses', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('keeps only the creator’s courses for an :own-scoped teacher', async () => {
    mocks.getSession.mockResolvedValue(session(['course:update:own']))
    mocks.listCourses.mockResolvedValue({
      items: [course(1), course(2, { creator_id: otherId }), course(3, { creator_id: null })],
      next_cursor: null,
    })

    const { courses, total, summary } = await getEditableCourses()

    expect(courses.map(c => c.name)).toEqual(['Course 1'])
    expect(total).toBe(1)
    expect(summary).toEqual({ total: 1, ready: 1, private: 0, attention: 0 })
    expect(mocks.listCourses).toHaveBeenCalledWith({ limit: 100 })
  })

  it('lets the admin wildcard see every course across all pages', async () => {
    mocks.getSession.mockResolvedValue({ ...session(['*:*:*']), userId: otherId })
    mocks.listCourses
      .mockResolvedValueOnce({ items: [course(1)], next_cursor: 'c1' })
      .mockResolvedValueOnce({ items: [course(2, { creator_id: null })], next_cursor: null })

    const { courses } = await getEditableCourses()

    expect(courses).toHaveLength(2)
    expect(mocks.listCourses).toHaveBeenLastCalledWith({ limit: 100, cursor: 'c1' })
  })

  it('applies the drafts preset, name sort and page slice client-side', async () => {
    mocks.getSession.mockResolvedValue(session(['course:update:own']))
    mocks.listCourses.mockResolvedValue({
      items: [
        course(1, { name: 'Zeta', public: false }),
        course(2, { name: 'Alpha', public: false }),
        course(3, { name: 'Mid', public: true }),
        course(4, { name: 'Beta', public: false }),
      ],
      next_cursor: null,
    })

    const drafts = await getEditableCourses(1, 2, '', 'name', 'drafts')
    expect(drafts.courses.map(c => c.name)).toEqual(['Alpha', 'Beta'])
    expect(drafts.total).toBe(3)
    expect(drafts.summary).toEqual({ total: 4, ready: 1, private: 3, attention: 0 })

    const page2 = await getEditableCourses(2, 2, '', 'name', 'drafts')
    expect(page2.courses.map(c => c.name)).toEqual(['Zeta'])

    const search = await getEditableCourses(1, 20, 'ALPHA')
    expect(search.courses.map(c => c.name)).toEqual(['Alpha'])
  })

  it('returns nothing without a session', async () => {
    mocks.getSession.mockResolvedValue(null)
    await expect(getEditableCourses()).resolves.toEqual({
      courses: [],
      total: 0,
      summary: { total: 0, ready: 0, private: 0, attention: 0 },
    })
    expect(mocks.listCourses).not.toHaveBeenCalled()
  })
})
