import { describe, expect, it, vi } from 'vite-plus/test'
import * as v from 'valibot'

import { courseCreateSchema, courseGeneralSchema } from '@/schemas/courseSchemas'
import { toAppCourse } from '@/hooks/courses/courseKeys'

vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }))
const mocks = vi.hoisted(() => ({
  apiResult: vi.fn(async () => ({
    data: wireCourse({ thumbnail_key: 'course-thumbnail/abc' }),
    status: 200,
    headers: {},
  })),
}))
vi.mock('@/lib/api-client', () => ({ apiJson: vi.fn(), apiResult: mocks.apiResult }))

import { updateCourseThumbnail } from '@/services/courses/courses'

function wireCourse(extra: Record<string, unknown> = {}) {
  return {
    id: '01a08bfb-2c9b-71b3-8985-d541d2b1716b',
    name: 'Fresh',
    description: '',
    about: '',
    tags: [],
    public: false,
    open_to_contributors: false,
    thumbnail_key: null,
    creator_id: null,
    contributor_ids: [],
    created_at_unix: 1,
    updated_at_unix: 1,
    ...extra,
  }
}

describe('course details form matches the v2 Course (F19)', () => {
  it('accepts a freshly created course as-is: only the name is required', () => {
    const result = v.safeParse(courseGeneralSchema, { name: 'Fresh', description: '', about: '', tags: [] })
    expect(result.success).toBe(true)
  })

  it('reports localizable validation keys, not raw length messages', () => {
    const issues = v
      .safeParse(courseGeneralSchema, {
        name: '',
        description: 'x'.repeat(5001),
        tags: ['ok'],
      })
      .issues?.map(issue => issue.message)
    expect(issues).toEqual(expect.arrayContaining(['title_required', 'description_too_long']))
  })
})

// UX-120: the create form trims like the details form — «   » never reaches POST /courses.
describe('course create form (F19)', () => {
  it('rejects a whitespace-only title inline', () => {
    const result = v.safeParse(courseCreateSchema, {
      title: '   ',
      description: '',
      structureMode: 'blank',
      initialVisibility: 'private',
      destination: 'overview',
    })
    expect(result.issues?.map(issue => issue.message)).toEqual(['title_required'])
  })
})

describe('course thumbnail (F19/F22)', () => {
  it('surfaces the wire thumbnail_key as thumbnail_image for the card and landing', () => {
    expect(toAppCourse(wireCourse({ thumbnail_key: 'course-thumbnail/abc' })).thumbnail_image).toBe(
      'course-thumbnail/abc',
    )
    expect(toAppCourse(wireCourse()).thumbnail_image).toBeNull()
  })

  it('claims the finalized upload through PATCH /courses/{id} (no legacy /thumbnail route)', async () => {
    const result = await updateCourseThumbnail('course_01a08bfb-2c9b-71b3-8985-d541d2b1716b', 'upload-1')
    expect(mocks.apiResult).toHaveBeenCalledWith(
      'courses/01a08bfb-2c9b-71b3-8985-d541d2b1716b',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ thumbnail_upload_id: 'upload-1' }) }),
      expect.anything(),
    )
    expect(result.data.thumbnail_image).toBe('course-thumbnail/abc')
  })
})
