/** @vitest-environment jsdom */
// Cluster B (video uploads): declared type, leave guard, cancel, YouTube ids, unplayable files.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

const mocks = vi.hoisted(() => ({ apiJson: vi.fn() }))
vi.mock('@/lib/api-client', () => ({ apiJson: mocks.apiJson }))

import { isPlayableVideoUpload, uploadFile, uploadMime } from '@services/media/uploads'
import { getYouTubeVideoId } from '@/lib/utils'
import { isUnplayableMediaError } from '@components/Objects/Activities/Video/Artplayer'

const file = (name: string, type: string) => new File(['0123456789'], name, { type })

describe('uploadMime (BUG-B1)', () => {
  it('maps what browsers report to the type the server policy matches', () => {
    expect(uploadMime(file('lecture.mkv', 'video/matroska'))).toBe('video/x-matroska') // Chromium on Windows
    expect(uploadMime(file('lecture.mkv', ''))).toBe('video/x-matroska')
    expect(uploadMime(file('IMG_0001.MOV', 'video/quicktime'))).toBe('video/quicktime')
    expect(uploadMime(file('old.avi', 'video/avi'))).toBe('video/x-msvideo')
    expect(uploadMime(file('photo.webp', 'image/webp'))).toBe('image/webp')
    expect(uploadMime(file('essay.docx', 'application/msword'))).toBe('application/msword')
    expect(uploadMime(new Blob(['x']))).toBe('application/octet-stream')
  })

  it('accepts the containers browsers play, not AVI/FLV', () => {
    expect(isPlayableVideoUpload(file('a.mov', 'video/quicktime'))).toBe(true)
    expect(isPlayableVideoUpload(file('a.mkv', 'video/matroska'))).toBe(true)
    expect(isPlayableVideoUpload(file('a.avi', 'video/avi'))).toBe(false)
    expect(isPlayableVideoUpload(file('a.flv', 'video/x-flv'))).toBe(false)
  })
})

describe('uploadFile', () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }))
    mocks.apiJson.mockImplementation(async (path: string, _init, parse) =>
      parse(
        path === 'uploads'
          ? { id: '01a09100-0000-7000-8000-0000000000e1', key: 'block-video/k', put_url: 'http://s3/put' }
          : { id: '01a09100-0000-7000-8000-0000000000e1', key: 'block-video/k', size_bytes: 10 },
      ),
    )
  })
  afterEach(() => vi.unstubAllGlobals())

  it('declares and PUTs the same canonical type (the PUT header is signed)', async () => {
    await uploadFile(file('lecture.mkv', 'video/matroska'), 'block-video')
    expect(JSON.parse(mocks.apiJson.mock.calls[0]![1].body).mime).toBe('video/x-matroska')
    expect(fetchMock.mock.calls[0]![1].headers['Content-Type']).toBe('video/x-matroska')
  })

  it('asks before the page unloads while an upload runs, and stops asking after', async () => {
    const add = vi.spyOn(window, 'addEventListener')
    const remove = vi.spyOn(window, 'removeEventListener')
    await uploadFile(file('a.mp4', 'video/mp4'), 'block-video')
    const guard = add.mock.calls.find(([type]) => type === 'beforeunload')?.[1]
    expect(guard).toBeTypeOf('function')
    expect(remove).toHaveBeenCalledWith('beforeunload', guard)
  })

  it('a cancel after the bytes landed does not finalize (no activity gets created)', async () => {
    const controller = new AbortController()
    fetchMock.mockImplementation(async () => {
      controller.abort()
      return new Response(null, { status: 200 })
    })
    await expect(
      uploadFile(file('a.mp4', 'video/mp4'), 'block-video', { signal: controller.signal }),
    ).rejects.toMatchObject({ code: 'REQUEST_ABORTED' })
    expect(mocks.apiJson.mock.calls.map(([path]) => path)).toEqual(['uploads'])
  })
})

describe('getYouTubeVideoId (BUG-B6)', () => {
  it.each([
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://m.youtube.com/watch?v=dQw4w9WgXcQ&t=42s', 'dQw4w9WgXcQ'],
    ['https://youtu.be/dQw4w9WgXcQ?t=42', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/shorts/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://youtube.com/live/dQw4w9WgXcQ?feature=share', 'dQw4w9WgXcQ'],
    ['https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/playlist?list=PL123', null],
    ['https://www.youtube.com/@channel', null],
  ])('%s', (url, id) => {
    expect(getYouTubeVideoId(url)).toBe(id)
  })
})

describe('isUnplayableMediaError (BUG-B2)', () => {
  const err = (code: number, message: string) => ({ code, message }) as MediaError
  it('tells a file the browser cannot open from a missing or unreachable one', () => {
    expect(isUnplayableMediaError(err(4, 'PipelineStatus::DEMUXER_ERROR_COULD_NOT_OPEN: FFmpegDemuxer'))).toBe(true)
    expect(isUnplayableMediaError(err(3, 'PIPELINE_ERROR_DECODE'))).toBe(true)
    expect(isUnplayableMediaError(err(4, 'MEDIA_ELEMENT_ERROR: Format error'))).toBe(false) // 404 / offline
    expect(isUnplayableMediaError(err(2, 'net::ERR_FAILED'))).toBe(false)
    expect(isUnplayableMediaError(null)).toBe(false)
  })
})
