/**
 * Hosted video / PDF activities on v2: the media goes through the presigned
 * upload pipeline, the activity is created via `createActivity`, and the
 * upload is claimed with `POST activities/{id}/blocks`. No multipart body
 * ever reaches the API.
 */

import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'

const mocks = vi.hoisted(() => ({
  apiJson: vi.fn(),
  uploadFile: vi.fn(),
  createActivity: vi.fn(),
}))

vi.mock('@/lib/api-client', () => ({ apiJson: mocks.apiJson }))
vi.mock('@services/media/uploads', () => ({ uploadFile: mocks.uploadFile }))
vi.mock('@services/courses/activities', () => ({ createActivity: mocks.createActivity }))

import { createFileActivity } from '@services/courses/activity-uploads'

const CHAPTER_ID = '01a09100-0000-7000-8000-0000000000c1'
const ACTIVITY_ID = '01a09100-0000-7000-8000-0000000000a1'
const UPLOAD_ID = '01a09100-0000-7000-8000-0000000000e1'

describe('createFileActivity (v2)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.uploadFile.mockImplementation(async (_file, purpose, options) => {
      options?.onProgress?.({ uploadedBytes: 5, totalBytes: 10, percentage: 50 })
      return { id: UPLOAD_ID, key: `${purpose}/deadbeef`, size_bytes: 10 }
    })
    mocks.createActivity.mockResolvedValue({ id: ACTIVITY_ID, activity_uuid: ACTIVITY_ID })
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
    expect(mocks.createActivity).toHaveBeenCalledWith(
      {
        name: 'Lecture',
        activity_type: 'TYPE_VIDEO',
        activity_sub_type: 'SUBTYPE_VIDEO_HOSTED',
        content: { filename: 'block-video/deadbeef', upload_id: UPLOAD_ID, file_name: 'lecture.mp4' },
        details,
      },
      CHAPTER_ID,
      { courseUuid: 'course-1' },
    )
    const [path, init] = mocks.apiJson.mock.calls[0]! as [
      string,
      { method: string; body: string; headers: Record<string, string> },
    ]
    expect(path).toBe(`activities/${ACTIVITY_ID}/blocks`)
    expect(init.method).toBe('POST')
    expect(init.headers['Content-Type']).toBe('application/json')
    expect(JSON.parse(init.body)).toEqual({ block_type: 'video', upload_id: UPLOAD_ID, file_name: 'lecture.mp4' })
    expect(created.activity_uuid).toBe(ACTIVITY_ID)
  })

  it('uploads a PDF as block-pdf and never sends FormData to the API', async () => {
    const file = new File(['%PDF-1.4'], 'notes.pdf', { type: 'application/pdf' })
    await createFileActivity(file, 'documentpdf', { name: 'Notes' }, CHAPTER_ID)

    expect(mocks.uploadFile).toHaveBeenCalledWith(file, 'block-pdf', expect.anything())
    expect(mocks.createActivity.mock.calls[0]![0]).toMatchObject({
      activity_type: 'TYPE_DOCUMENT',
      activity_sub_type: 'SUBTYPE_DOCUMENT_PDF',
      content: { filename: 'block-pdf/deadbeef' },
    })
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
    expect(mocks.apiJson).not.toHaveBeenCalled()
  })
})
