import { afterEach, describe, expect, test, vi } from 'vite-plus/test'

import { FakeStorage, json, SLOT } from './testing'
import { upload } from './upload'

afterEach(() => {
  vi.unstubAllGlobals()
  FakeStorage.status = 200
  FakeStorage.last = null
  FakeStorage.gate = Promise.resolve()
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
