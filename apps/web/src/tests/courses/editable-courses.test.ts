import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { getEditableCourses, searchEditableCourses } from '@services/courses/editable'

/**
 * The teacher listing is `GET /courses?mine=true` with `q` / `sort` /
 * `preset` on the server and the `summary` block on the page; the legacy
 * page number is emulated by hopping cursors.
 */

const mocks = vi.hoisted(() => ({
  listCourses: vi.fn(),
  getSession: vi.fn(),
}))

vi.mock('@/lib/api/generated/courses/courses', () => ({ listCourses: mocks.listCourses }))
vi.mock('@/lib/auth/session', () => ({ getSession: mocks.getSession, requireSession: vi.fn() }))

const teacherId = '01a08bd6-a04f-76ac-92cd-4daaf9a31de7'
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

const summary = { total: 7, ready: 4, private: 3, attention: 2 }
const session = { userId: teacherId, roles: [], permissions: ['course:update:own'], user: {} }

describe('getEditableCourses', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getSession.mockResolvedValue(session)
  })

  it('asks the server for the editable set and passes the summary through', async () => {
    mocks.listCourses.mockResolvedValue({ items: [course(1), course(2)], next_cursor: null, summary })

    const result = await getEditableCourses(1, 24)

    expect(mocks.listCourses).toHaveBeenCalledWith({ mine: true, limit: 24, sort: 'updated', preset: 'all' })
    expect(result.courses.map(c => c.course_uuid)).toEqual([course(1).id, course(2).id])
    expect(result.summary).toEqual(summary)
    expect(result.total).toBe(7)
  })

  it('maps the web filters onto q / sort / preset and hops cursors for page N', async () => {
    mocks.listCourses
      .mockResolvedValueOnce({ items: [course(1)], next_cursor: 'c1', summary })
      .mockResolvedValueOnce({ items: [course(2)], next_cursor: 'c2', summary })

    const page2 = await getEditableCourses(2, 1, ' alpha ', 'name', 'private')

    expect(mocks.listCourses).toHaveBeenNthCalledWith(1, { mine: true, limit: 1, sort: 'name', preset: 'drafts', q: 'alpha' })
    expect(mocks.listCourses).toHaveBeenNthCalledWith(2, {
      mine: true,
      limit: 1,
      sort: 'name',
      preset: 'drafts',
      q: 'alpha',
      cursor: 'c1',
    })
    expect(page2.courses.map(c => c.name)).toEqual(['Course 2'])
    // Filtered: a lower bound that still signals a next page.
    expect(page2.total).toBe(3)
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

  it('searchEditableCourses swallows failures', async () => {
    mocks.listCourses.mockRejectedValue(new Error('boom'))
    await expect(searchEditableCourses('x')).resolves.toEqual([])
  })
})
