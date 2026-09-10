import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import { useCreateCourseMutation } from '@/features/courses/create/useCreateCourseMutation'
import { createNewCourse } from '@services/courses/courses'
import { createChapter } from '@services/courses/chapters'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('@services/courses/courses', () => ({ createNewCourse: vi.fn(), getCourseMetadata: vi.fn() }))
vi.mock('@services/courses/chapters', () => ({ createChapter: vi.fn() }))

const courseId = '01a08bfb-2c9b-71b3-8985-d541d2b1716b'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(createNewCourse).mockResolvedValue({
    data: { course_uuid: courseId, id: courseId, name: 'New course' },
    headers: {},
    requestId: null,
    status: 201,
    statusText: '',
  } as never)
  vi.mocked(createChapter).mockResolvedValue({ chapter_uuid: 'ch-1', activities: [] } as never)
})

describe('useCreateCourseMutation — BUG-012 starter template', () => {
  it('seeds the two promised starter chapters instead of silently creating zero', async () => {
    const { result } = renderHook(() => useCreateCourseMutation())

    let outcome: Awaited<ReturnType<typeof result.current.mutate>> | undefined
    await act(async () => {
      outcome = await result.current.mutate(
        { title: 'New course', description: '', structureMode: 'starter', initialVisibility: 'private' },
        'overview',
      )
    })

    expect(createChapter).toHaveBeenCalledTimes(2)
    expect(createChapter).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        name: 'introduction.name',
        description: 'introduction.description',
        course_uuid: courseId,
      }),
    )
    expect(createChapter).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        name: 'coreLessons.name',
        description: 'coreLessons.description',
        course_uuid: courseId,
      }),
    )
    expect(outcome).toMatchObject({ status: 'success', importedChapterCount: 2 })
  })
})
