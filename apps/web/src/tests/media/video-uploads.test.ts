/** @vitest-environment jsdom */
// Cluster B (video uploads): declared type, leave guard, cancel, YouTube ids, unplayable files.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

const mocks = vi.hoisted(() => ({ apiJson: vi.fn() }))
vi.mock('@/lib/api-client', () => ({ apiJson: mocks.apiJson }))

import { UPLOAD_MAX_BYTES, isPlayableVideoUpload, uploadFile, uploadMime } from '@services/media/uploads'
import { getYouTubeVideoId } from '@/lib/utils'
import { isUnplayableMediaError } from '@components/Objects/Activities/Video/Artplayer'
import { presentApiError } from '@/lib/api/error-presenter'

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

// The server takes block videos up to 2 GB since aed00c9; the old web still refused anything over 500 MB.
it('lets a video up to 2 GB through, like the server', () => {
  expect(UPLOAD_MAX_BYTES['block-video']).toBe(2048 * 1024 * 1024)
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

  it.each([413, 403, 503])('preserves a storage HTTP %s instead of reporting an offline connection', async status => {
    fetchMock.mockResolvedValue(new Response(null, { status }))
    await expect(uploadFile(file('a.mp4', 'video/mp4'), 'block-video')).rejects.toMatchObject({
      status,
      code: status === 413 ? 'payload-too-large' : `HTTP_${status}`,
    })
    expect(mocks.apiJson.mock.calls.map(([path]) => path)).toEqual(['uploads'])
  })

  it('shows the localized size error when a progress upload is rejected by the proxy', async () => {
    class RejectedUpload extends EventTarget {
      status = 413
      upload = new EventTarget()
      open = vi.fn()
      setRequestHeader = vi.fn()
      send() {
        this.dispatchEvent(new Event('load'))
      }
    }
    vi.stubGlobal('XMLHttpRequest', RejectedUpload)
    const error = await uploadFile(file('a.mp4', 'video/mp4'), 'block-video', {
      onProgress: vi.fn(),
    }).catch(error => error)
    expect(error).toMatchObject({ status: 413, code: 'payload-too-large' })
    expect(
      presentApiError(error, { copy: { byCode: { 'payload-too-large': 'Upload size limit exceeded' } } }),
    ).toMatchObject({ description: 'Upload size limit exceeded', retryPolicy: 'none' })
    expect(mocks.apiJson.mock.calls.map(([path]) => path)).toEqual(['uploads'])
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

  it('a cancelled upload never creates a slot', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(
      uploadFile(file('a.mp4', 'video/mp4'), 'block-video', { signal: controller.signal }),
    ).rejects.toMatchObject({ code: 'REQUEST_ABORTED' })
    expect(mocks.apiJson).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('cancellation reaches create and finalize requests; finalize carries a stable retry key', async () => {
    const controller = new AbortController()
    await uploadFile(file('a.mp4', 'video/mp4'), 'block-video', { signal: controller.signal })
    expect(mocks.apiJson.mock.calls[0]![1].signal).toBe(controller.signal)
    expect(mocks.apiJson.mock.calls[1]![1]).toMatchObject({
      signal: controller.signal,
      headers: { 'Idempotency-Key': '01a09100-0000-7000-8000-0000000000e1' },
    })
  })
})

describe('multipart videos', () => {
  const partSize = 32 * 1024 * 1024
  const slot = {
    id: '01a09100-0000-7000-8000-0000000000e1',
    key: 'block-video/k',
    put_url: 'http://s3/unused',
    multipart: { part_size_bytes: partSize, part_urls: ['http://s3/part1', 'http://s3/part2'] },
  }
  afterEach(() => vi.unstubAllGlobals())

  it('sends 32 MB slices, retries only a failed part, and completes with ordered ETags before finalize', async () => {
    const sent: { url: string; size: number; headers: Record<string, string> }[] = []
    class Parts extends EventTarget {
      upload = new EventTarget()
      status = 200
      url = ''
      headers: Record<string, string> = {}
      open(_method: string, url: string) {
        this.url = url
      }
      setRequestHeader(name: string, value: string) {
        this.headers[name] = value
      }
      getResponseHeader() {
        return this.url.endsWith('1') ? '"aaa"' : '"bbb"'
      }
      send(body: Blob) {
        sent.push({ url: this.url, size: body.size, headers: this.headers })
        this.status = sent.length === 2 ? 503 : 200
        this.upload.dispatchEvent(
          new ProgressEvent('progress', { lengthComputable: true, loaded: body.size, total: body.size }),
        )
        this.dispatchEvent(new Event('load'))
        this.dispatchEvent(new Event('loadend'))
      }
    }
    vi.stubGlobal('XMLHttpRequest', Parts)
    mocks.apiJson.mockReset()
    mocks.apiJson.mockImplementation(async (path: string, _init, parse) =>
      path === 'uploads'
        ? parse(slot)
        : path.endsWith('/finalize')
          ? parse({ id: slot.id, key: slot.key, size_bytes: partSize + 7 })
          : undefined,
    )
    const progress: number[] = []
    await uploadFile(new File([new Uint8Array(partSize + 7)], 'a.mp4', { type: 'video/mp4' }), 'block-video', {
      onProgress: value => progress.push(value.percentage),
    })
    expect(JSON.parse(mocks.apiJson.mock.calls[0]![1].body).multipart).toBe(true)
    expect(sent.map(({ url, size }) => [url, size])).toEqual([
      ['http://s3/part1', partSize],
      ['http://s3/part2', 7],
      ['http://s3/part2', 7],
    ])
    expect(sent.every(({ headers }) => headers['If-None-Match'] === undefined)).toBe(true)
    expect(sent.every(({ headers }) => headers['Content-Type'] === 'video/mp4')).toBe(true)
    expect(mocks.apiJson.mock.calls.map(([path]) => path)).toEqual([
      'uploads',
      `uploads/${slot.id}/multipart`,
      `uploads/${slot.id}/finalize`,
    ])
    expect(JSON.parse(mocks.apiJson.mock.calls[1]![1].body)).toEqual({ etags: ['"aaa"', '"bbb"'] })
    expect(progress.at(-1)).toBe(100)
    expect(progress).toEqual([...progress].sort((a, b) => a - b))
  })

  it('a fatal part error aborts the storage session and never finalizes', async () => {
    mocks.apiJson.mockReset()
    mocks.apiJson.mockImplementation(async (path: string, _init, parse) =>
      path === 'uploads' ? parse(slot) : undefined,
    )
    const fetchMock = vi.fn(async () => new Response(null, { status: 403 }))
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('XMLHttpRequest', undefined)
    await expect(
      uploadFile(new File([new Uint8Array(partSize + 7)], 'a.mp4', { type: 'video/mp4' }), 'block-video'),
    ).rejects.toMatchObject({ status: 403 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(mocks.apiJson.mock.calls.map(([path, init]) => [path, init.method])).toEqual([
      ['uploads', 'POST'],
      [`uploads/${slot.id}/multipart`, 'DELETE'],
    ])
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
