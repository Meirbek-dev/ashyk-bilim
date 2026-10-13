import { afterEach, describe, expect, test, vi } from 'vite-plus/test'

import { FakeStorage, json, SLOT } from './testing'
import { upload, type UploadResume } from './upload'

afterEach(() => {
  vi.unstubAllGlobals()
  FakeStorage.status = 200
  FakeStorage.last = null
  FakeStorage.gate = Promise.resolve()
})

describe('multipart video', () => {
  test('retries just the failed slice and preserves parts when assembly needs sign-in', async () => {
    const partSize = 32 * 1024 * 1024
    const multipart = {
      part_size_bytes: partSize,
      part_urls: ['https://storage.test/part1', 'https://storage.test/part2'],
    }
    const sizes: number[] = []
    class Parts extends FakeStorage {
      override send(body: Blob) {
        sizes.push(body.size)
        this.status = sizes.length === 2 ? 503 : 200
        this.upload.dispatchEvent(
          new ProgressEvent('progress', { lengthComputable: true, loaded: body.size, total: body.size }),
        )
        this.dispatchEvent(new Event('load'))
        this.dispatchEvent(new Event('loadend'))
      }
    }
    vi.stubGlobal('XMLHttpRequest', Parts)
    let signedIn = false
    const api = vi.fn<(request: Request) => Promise<Response>>(async request => {
      if (request.url.endsWith('/multipart'))
        return signedIn
          ? new Response(null, { status: 204 })
          : new Response(JSON.stringify({ code: 'session-expired', status: 401 }), {
              status: 401,
              headers: { 'content-type': 'application/problem+json' },
            })
      return request.url.endsWith('/finalize')
        ? json({ id: SLOT.id, key: SLOT.key, size_bytes: partSize + 7 })
        : json({ ...SLOT, multipart })
    })
    vi.stubGlobal('fetch', api)
    const file = new File([new Uint8Array(partSize + 7)], 'a.mp4', { type: 'video/mp4' })
    let resume: UploadResume | undefined
    await expect(
      upload(file, 'block-video', {
        onStored: slot => {
          resume = slot
        },
      }),
    ).rejects.toMatchObject({ status: 401 })
    expect(sizes).toEqual([partSize, 7, 7])
    expect(resume?.etags).toHaveLength(2)
    expect(await api.mock.calls[0]?.[0].json()).toMatchObject({ multipart: true })
    signedIn = true
    await expect(upload(file, 'block-video', { resume })).resolves.toMatchObject({ id: SLOT.id })
    expect(sizes).toEqual([partSize, 7, 7])
    expect(api.mock.calls.map(([request]) => request.url.split('/').at(-1))).toEqual([
      'uploads',
      'multipart',
      'multipart',
      'finalize',
    ])
  })

  test('a fatal part rejection cancels the multipart slot, without assembly or finalize', async () => {
    const api = vi.fn<(request: Request) => Promise<Response>>(async request =>
      request.method === 'DELETE'
        ? new Response(null, { status: 204 })
        : json({
            ...SLOT,
            multipart: { part_size_bytes: 32 * 1024 * 1024, part_urls: ['https://storage.test/part1'] },
          }),
    )
    vi.stubGlobal('fetch', api)
    vi.stubGlobal('XMLHttpRequest', FakeStorage)
    FakeStorage.status = 403
    await expect(upload(new File(['a'], 'a.mp4', { type: 'video/mp4' }), 'block-video')).rejects.toMatchObject({
      status: 403,
    })
    expect(api.mock.calls.map(([request]) => request.method)).toEqual(['POST', 'DELETE'])
  })
})

describe('upload (create -> presigned PUT -> finalize)', () => {
  test('sends the bytes to storage with progress and finalizes with the slot id as the retry key', async () => {
    const api = vi.fn<(request: Request) => Promise<Response>>(async request =>
      request.url.endsWith('/finalize') ? json({ id: SLOT.id, key: SLOT.key, size_bytes: 4 }) : json(SLOT),
    )
    vi.stubGlobal('fetch', api)
    vi.stubGlobal('XMLHttpRequest', FakeStorage)
    const progress: number[] = []
    const file = new File(['abcd'], 'a.png', { type: 'image/png' })

    const done = await upload(file, 'course-thumbnail', { onProgress: fraction => progress.push(fraction) })

    expect(done).toMatchObject({ id: SLOT.id, key: SLOT.key })
    const [create, finalize] = api.mock.calls.map(([request]) => request)
    expect(create?.url).toMatch(/\/api\/v2\/uploads$/)
    expect(await create?.json()).toEqual({ purpose: 'course-thumbnail', mime: 'image/png', size_bytes: 4 })
    expect(finalize?.url).toMatch(new RegExp(`/api/v2/uploads/${SLOT.id}/finalize$`))
    expect(finalize?.headers.get('idempotency-key')).toBe(SLOT.id)
    expect(FakeStorage.last).toMatchObject({ method: 'PUT', url: SLOT.put_url })
    expect(FakeStorage.last?.headers.get('If-None-Match')).toBe('*')
    expect(FakeStorage.last?.headers.get('Content-Type')).toBe('image/png')
    expect(progress).toEqual([0.5])
  })

  test('a refused PUT stops before finalize', async () => {
    const api = vi.fn<(request: Request) => Promise<Response>>(async () => json(SLOT))
    vi.stubGlobal('fetch', api)
    vi.stubGlobal('XMLHttpRequest', FakeStorage)
    FakeStorage.status = 403

    await expect(upload(new File(['x'], 'a.png', { type: 'image/png' }), 'avatar')).rejects.toThrow('403')
    expect(api).toHaveBeenCalledTimes(1)
  })

  test('cancelling after slot creation prevents the PUT and finalize', async () => {
    const controller = new AbortController()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        controller.abort()
        return json(SLOT)
      }),
    )
    vi.stubGlobal('XMLHttpRequest', FakeStorage)
    await expect(
      upload(new File(['x'], 'a.png', { type: 'image/png' }), 'avatar', {
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(FakeStorage.last).toBeNull()
  })

  test('a storage size rejection preserves its localized error code', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json(SLOT)),
    )
    vi.stubGlobal('XMLHttpRequest', FakeStorage)
    FakeStorage.status = 413
    await expect(upload(new File(['x'], 'a.mp4', { type: 'video/mp4' }), 'block-video')).rejects.toMatchObject({
      code: 'payload-too-large',
      status: 413,
    })
  })
})
