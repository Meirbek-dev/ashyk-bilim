/**
 * Editor image / PDF / video blocks on v2: bytes go through the presigned
 * upload pipeline and the upload is claimed with `POST activities/{id}/blocks`.
 * No multipart body (legacy `blocks/*`, `uploads/initiate|chunk|complete`)
 * ever reaches the API.
 */

import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'

const mocks = vi.hoisted(() => ({
  apiJson: vi.fn(),
  uploadFile: vi.fn(),
}))

vi.mock('@/lib/api-client', () => ({ apiJson: mocks.apiJson }))
vi.mock('@services/media/uploads', () => ({ uploadFile: mocks.uploadFile }))
vi.mock('@services/config/env', () => ({ getPublicConfig: () => ({ mediaUrl: 'https://media.test/', siteUrl: '' }) }))

import { uploadNewImageFile } from '@services/blocks/Image/images'
import { uploadNewPDFFile } from '@services/blocks/Pdf/pdf'
import { getBlockFileUrl } from '@services/blocks/upload'
import { uploadNewVideoFile } from '@services/blocks/Video/video'

const ACTIVITY_ID = '01a09100-0000-7000-8000-0000000000a1'
const UPLOAD_ID = '01a09100-0000-7000-8000-0000000000e1'
const BLOCK_ID = '01a09100-0000-7000-8000-0000000000b1'

const cases = [
  { type: 'image', file: new File(['png'], 'Photo.PNG', { type: 'image/png' }), run: uploadNewImageFile },
  { type: 'pdf', file: new File(['%PDF-1.4'], 'notes.pdf', { type: 'application/pdf' }), run: uploadNewPDFFile },
  { type: 'video', file: new File(['0123456789'], 'lecture.mp4', { type: 'video/mp4' }), run: uploadNewVideoFile },
] as const

describe('editor block uploads (v2)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.uploadFile.mockImplementation(async (_file, purpose: string, options) => {
      options?.onProgress?.({ uploadedBytes: 5, totalBytes: 10, percentage: 50 })
      return { id: UPLOAD_ID, key: `${purpose}/deadbeef`, size_bytes: 10 }
    })
    mocks.apiJson.mockImplementation(async (_path, init, parse) =>
      parse({
        id: BLOCK_ID,
        activity_id: ACTIVITY_ID,
        block_type: JSON.parse(init.body).block_type,
        content: { upload_id: UPLOAD_ID, file_key: 'x', file_name: 'x', file_size: 10, file_type: 'x' },
        created_at_unix: 1,
      }),
    )
  })

  for (const { type, file, run } of cases) {
    it(`${type}: uploadFile('block-${type}') then POST activities/{id}/blocks, no multipart`, async () => {
      const object = await run(file, ACTIVITY_ID)

      expect(mocks.uploadFile).toHaveBeenCalledTimes(1)
      expect(mocks.uploadFile.mock.calls[0]!.slice(0, 2)).toEqual([file, `block-${type}`])

      expect(mocks.apiJson).toHaveBeenCalledTimes(1)
      const [path, init] = mocks.apiJson.mock.calls[0]! as [
        string,
        { method: string; body: unknown; headers: Record<string, string> },
      ]
      expect(path).toBe(`activities/${ACTIVITY_ID}/blocks`)
      expect(init.method).toBe('POST')
      expect(init.headers['Content-Type']).toBe('application/json')
      expect(init.body).not.toBeInstanceOf(FormData)
      expect(JSON.parse(init.body as string)).toEqual({ block_type: type, upload_id: UPLOAD_ID, file_name: file.name })

      expect(object).toEqual({
        block_uuid: BLOCK_ID,
        content: {
          file_id: UPLOAD_ID,
          file_key: `block-${type}/deadbeef`,
          file_format: file.name.split('.').pop()!.toLowerCase(),
          file_name: file.name,
        },
      })
      expect(getBlockFileUrl(object.content)).toBe(`https://media.test/content/block-${type}/deadbeef`)
    })
  }

  it('video forwards the presigned PUT progress to the editor callback', async () => {
    const onProgress = vi.fn()
    await uploadNewVideoFile(cases[2].file, ACTIVITY_ID, onProgress)
    expect(mocks.uploadFile).toHaveBeenCalledWith(cases[2].file, 'block-video', { onProgress: expect.any(Function) })
    expect(onProgress).toHaveBeenCalledWith({ uploadedBytes: 5, totalBytes: 10, percentage: 50 })
  })

  it('legacy (ETL-migrated) block objects still resolve <file_id>.<file_format>', () => {
    expect(getBlockFileUrl({ file_id: '01A_block_01B', file_format: 'pdf' })).toBe(
      'https://media.test/content/01A_block_01B.pdf',
    )
    expect(getBlockFileUrl(null)).toBeNull()
  })
})
