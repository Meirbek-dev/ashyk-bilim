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
