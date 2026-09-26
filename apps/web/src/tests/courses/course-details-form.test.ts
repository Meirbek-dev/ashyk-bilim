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

import { updateCourseMetadata, updateCourseThumbnail } from '@/services/courses/courses'

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
    thumbnail_video_key: null,
    learnings: [],
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

  // UX-147: the details form can drop the thumbnail — `null` on the wire.
  it('removes the thumbnail with thumbnail_upload_id: null', async () => {
    await updateCourseThumbnail('course_01a08bfb-2c9b-71b3-8985-d541d2b1716b', null)
    expect(mocks.apiResult).toHaveBeenLastCalledWith(
      'courses/01a08bfb-2c9b-71b3-8985-d541d2b1716b',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ thumbnail_upload_id: null }) }),
      expect.anything(),
    )
  })
})

// Restore regression: learnings were never read nor written by the v2 client.
describe('course learnings (What you will learn)', () => {
  const row = (text: string, emoji = '') => ({ id: 'l1', text, emoji })
  const base = { name: 'Fresh', description: '', about: '', tags: [] }

  it('validates rows like the server: trimmed text 1..=300, at most 30', () => {
    const ok = v.safeParse(courseGeneralSchema, { ...base, learnings: [row('  Ownership  ', '🦀')] })
    expect(ok.success && ok.output.learnings).toEqual([{ id: 'l1', text: 'Ownership', emoji: '🦀' }])
    const messages = (learnings: unknown) =>
      v.safeParse(courseGeneralSchema, { ...base, learnings }).issues?.map(issue => issue.message)
    expect(messages([row('   ')])).toEqual(['learning_required'])
    expect(messages([row('x'.repeat(301))])).toEqual(['learning_too_long'])
    expect(messages(Array.from({ length: 31 }, (_, i) => ({ ...row('t'), id: String(i) })))).toEqual([
      'too_many_learnings',
    ])
  })

  it('sends learnings on the course PATCH, blank emoji as null', async () => {
    await updateCourseMetadata('01a08bfb-2c9b-71b3-8985-d541d2b1716b', {
      learnings: [row('Ownership', '🦀'), row('Borrowing')],
    })
    expect(mocks.apiResult).toHaveBeenLastCalledWith(
      'courses/01a08bfb-2c9b-71b3-8985-d541d2b1716b',
      expect.objectContaining({
        body: JSON.stringify({
          learnings: [
            { id: 'l1', text: 'Ownership', emoji: '🦀' },
            { id: 'l1', text: 'Borrowing', emoji: null },
          ],
        }),
      }),
      expect.anything(),
    )
  })

  it('maps the legacy video thumbnail onto the course page fields', () => {
    const both = toAppCourse(wireCourse({ thumbnail_key: 'i.png', thumbnail_video_key: 'v.mp4' }))
    expect([both.thumbnail_video, both.thumbnail_type]).toEqual(['v.mp4', 'both'])
    expect(toAppCourse(wireCourse({ thumbnail_video_key: 'v.mp4' })).thumbnail_type).toBe('video')
    expect(toAppCourse(wireCourse()).thumbnail_type).toBe('image')
  })
})
