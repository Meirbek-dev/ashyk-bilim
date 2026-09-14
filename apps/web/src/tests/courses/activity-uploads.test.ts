/**
 * Hosted video / PDF activities on v2: the media goes through the presigned
 * upload pipeline, the activity is created via the real `createActivity`
 * (POST, then a content PATCH locked with `If-Match`), and the upload is
 * claimed with `POST activities/{id}/blocks`. No multipart body ever reaches
 * the API. `POST chapters/{id}/activities` answers 201 with `version` in the
 * body and no `ETag` (BUG-149): the chain must still lock the PATCH.
 */

import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'

const mocks = vi.hoisted(() => ({
  apiJson: vi.fn(),
  apiResult: vi.fn(),
  uploadFile: vi.fn(),
}))

vi.mock('@/lib/api-client', () => ({ apiJson: mocks.apiJson, apiResult: mocks.apiResult }))
vi.mock('@services/media/uploads', () => ({ uploadFile: mocks.uploadFile }))

import { createFileActivity } from '@services/courses/activity-uploads'

const CHAPTER_ID = '01a09100-0000-7000-8000-0000000000c1'
const COURSE_ID = '01a09100-0000-7000-8000-0000000000d1'
const ACTIVITY_ID = '01a09100-0000-7000-8000-0000000000a1'
const UPLOAD_ID = '01a09100-0000-7000-8000-0000000000e1'

type Init = { method: string; body: string; headers: Record<string, string> }

function wireActivity(activity_type: string, activity_sub_type: string, version: number) {
  return {
    id: ACTIVITY_ID,
    chapter_id: CHAPTER_ID,
    course_id: COURSE_ID,
    name: 'Lecture',
    activity_type,
    activity_sub_type,
    position: 1,
    published: false,
    version,
  }
}

/** The create call (body version only, no ETag) and the PATCH it must lock. */
function createCalls() {
  const calls = mocks.apiResult.mock.calls as [string, Init][]
  const post = calls.find(([, init]) => init.method === 'POST')!
  const patch = calls.find(([, init]) => init.method === 'PATCH')!
  return { post, patch }
}

describe('createFileActivity (v2)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.uploadFile.mockImplementation(async (_file, purpose, options) => {
      options?.onProgress?.({ uploadedBytes: 5, totalBytes: 10, percentage: 50 })
      return { id: UPLOAD_ID, key: `${purpose}/deadbeef`, size_bytes: 10 }
    })
    mocks.apiResult.mockImplementation(async (_path: string, init: Init, parse: (data: unknown) => unknown) => {
      const body = JSON.parse(init.body) as { activity_type?: string; activity_sub_type?: string }
      // 201: version in the body, no ETag. 200 (PATCH): the ETag carries the bump.
      return init.method === 'POST'
        ? { data: parse(wireActivity(body.activity_type!, body.activity_sub_type!, 1)), headers: {} }
        : { data: parse(wireActivity('video', 'video_hosted', 2)), headers: { etag: '"2"' } }
    })
    mocks.apiJson.mockImplementation(async (_path, _init, parse) =>
      parse({
        id: '01a09100-0000-7000-8000-0000000000b1',
        activity_id: ACTIVITY_ID,
        block_type: 'video',
        content: {},
        created_at_unix: 1,
      }),
    )
  })

  it('uploads a video as block-video, creates the hosted activity and claims the upload as a block', async () => {
    const file = new File(['0123456789'], 'lecture.mp4', { type: 'video/mp4' })
    const onProgress = vi.fn()
    const details = { startTime: 0, endTime: null, autoplay: false, muted: false, subtitles: [] }

    const created = await createFileActivity(
      file,
      'video',
      { name: 'Lecture', details, course_uuid: 'course-1' },
      CHAPTER_ID,
      onProgress,
    )

    expect(mocks.uploadFile).toHaveBeenCalledWith(file, 'block-video', { onProgress: expect.any(Function) })
    expect(onProgress).toHaveBeenCalledWith({ percentage: 50 })
    const { post, patch } = createCalls()
    expect(post[0]).toBe(`chapters/${CHAPTER_ID}/activities`)
    expect(JSON.parse(post[1].body)).toEqual({
      name: 'Lecture',
      activity_type: 'video',
      activity_sub_type: 'video_hosted',
    })
    // BUG-149: the 201 had no ETag — the body version still locks the PATCH.
    expect(patch[0]).toBe(`activities/${ACTIVITY_ID}`)
    expect(patch[1].headers['If-Match']).toBe('"1"')
    expect(JSON.parse(patch[1].body)).toEqual({
      content: { filename: 'block-video/deadbeef', upload_id: UPLOAD_ID, file_name: 'lecture.mp4' },
      details,
    })
    const [path, init] = mocks.apiJson.mock.calls[0]! as [string, Init]
    expect(path).toBe(`activities/${ACTIVITY_ID}/blocks`)
    expect(init.method).toBe('POST')
    expect(init.headers['Content-Type']).toBe('application/json')
    expect(JSON.parse(init.body)).toEqual({ block_type: 'video', upload_id: UPLOAD_ID, file_name: 'lecture.mp4' })
    expect(created.activity_uuid).toBe(ACTIVITY_ID)
    expect(created.version).toBe(2)
  })

  it('uploads a PDF as block-pdf and never sends FormData to the API', async () => {
    const file = new File(['%PDF-1.4'], 'notes.pdf', { type: 'application/pdf' })
    await createFileActivity(file, 'documentpdf', { name: 'Notes' }, CHAPTER_ID)

    expect(mocks.uploadFile).toHaveBeenCalledWith(file, 'block-pdf', expect.anything())
    const { post, patch } = createCalls()
    expect(JSON.parse(post[1].body)).toMatchObject({ activity_type: 'document', activity_sub_type: 'document_pdf' })
    expect(patch[1].headers['If-Match']).toBe('"1"')
    expect(JSON.parse(patch[1].body)).toMatchObject({ content: { filename: 'block-pdf/deadbeef' } })
    for (const [path, init] of mocks.apiJson.mock.calls as [string, { body?: unknown }][]) {
      expect(path).not.toMatch(/^activities\/(video|documentpdf)$/)
      expect(init.body).not.toBeInstanceOf(FormData)
    }
    expect(JSON.parse(mocks.apiJson.mock.calls[0]![1].body as string)).toMatchObject({ block_type: 'pdf' })
  })

  it('rejects unknown file activity types before touching the network', async () => {
    const file = new File(['x'], 'x.bin')
    await expect(createFileActivity(file, 'audio', {}, CHAPTER_ID)).rejects.toThrow(/Unsupported file activity type/)
    expect(mocks.uploadFile).not.toHaveBeenCalled()
    expect(mocks.apiResult).not.toHaveBeenCalled()
    expect(mocks.apiJson).not.toHaveBeenCalled()
  })
})
