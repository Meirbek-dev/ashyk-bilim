import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import { apiJson } from '@/lib/api-client'
import { getCourseMetadata } from '@/services/courses/courses'

vi.mock('@/lib/api-client', () => ({ apiJson: vi.fn(), apiResult: vi.fn() }))
vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }))

const courseId = '01a08bfb-2c9b-71b3-8985-d541d2b1716b'

beforeEach(() => vi.resetAllMocks())

describe('getCourseMetadata (BUG-011)', () => {
  it('reads the course through GET courses/{id} + GET courses/{id}/curriculum, not the removed v1 courses/{id}/meta route', async () => {
    vi.mocked(apiJson).mockImplementation(async (path: unknown) => {
      if (path === `courses/${courseId}`) {
        return {
          id: courseId,
          name: 'Основы Python',
          description: '',
          about: '',
          tags: [],
          public: false,
          open_to_contributors: false,
          created_at_unix: 1,
          updated_at_unix: 1,
        }
      }
      if (path === `courses/${courseId}/curriculum`) {
        return { chapters: [] }
      }
      throw new Error(`unexpected apiJson call: ${String(path)}`)
    })

    const course = await getCourseMetadata(courseId)

    expect(apiJson).toHaveBeenCalledWith(`courses/${courseId}`, expect.anything(), expect.anything())
    expect(apiJson).toHaveBeenCalledWith(`courses/${courseId}/curriculum`, expect.anything(), expect.anything())
    expect(course).toMatchObject({ course_uuid: courseId, name: 'Основы Python', chapters: [] })
  })
})

// UX-102: the learner shape drops chapters with no published lesson («Глава 2 —
// Черновики · 0 учебных задач»); the author shape keeps every chapter.
describe('getCourseMetadata learner shape', () => {
  const chapter = (id: string, published: boolean[]) => ({
    id,
    course_id: courseId,
    name: id,
    description: '',
    position: 1,
    activities: published.map((flag, index) => ({
      id: `${id.slice(0, 35)}${index}`,
      chapter_id: id,
      course_id: courseId,
      name: `a${index}`,
      position: index + 1,
      published: flag,
      activity_type: 'dynamic',
      activity_sub_type: 'dynamic_page',
      version: 1,
    })),
  })
  const curriculum = {
    chapters: [
      chapter('01a08bfb-2c9b-71b3-8985-d541d2b1716c', [true, false]),
      chapter('01a08bfb-2c9b-71b3-8985-d541d2b1716d', [false]),
      chapter('01a08bfb-2c9b-71b3-8985-d541d2b1716e', []),
    ],
  }
  beforeEach(() => {
    vi.mocked(apiJson).mockImplementation(
      async (path: unknown, _init: unknown, parse?: (value: unknown) => unknown) => {
        const value =
          path === `courses/${courseId}`
            ? {
                id: courseId,
                name: 'C',
                description: '',
                about: '',
                tags: [],
                public: true,
                contributor_ids: [],
                learnings: [],
                open_to_contributors: false,
                created_at_unix: 1,
                updated_at_unix: 1,
              }
            : curriculum
        return parse ? parse(value) : value
      },
    )
  })

  it('hides chapters without a published lesson for learners', async () => {
    const course = await getCourseMetadata(courseId)
    expect(course.chapters?.map(c => c.activities?.length)).toEqual([1])
  })

  it('keeps every chapter and draft for authors', async () => {
    const course = await getCourseMetadata(courseId, undefined, true)
    expect(course.chapters?.map(c => c.activities?.length)).toEqual([2, 1, 0])
  })
})
