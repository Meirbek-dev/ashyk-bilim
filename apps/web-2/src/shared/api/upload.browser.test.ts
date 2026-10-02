import { afterEach, describe, expect, test, vi } from 'vite-plus/test'

import { upload } from './upload'

const SLOT = { id: '0190a5d2-0000-7000-8000-000000000001', key: 'uploads/a.png', put_url: 'https://storage.test/put' }

/** Storage's side of the PUT: records the request, reports progress, answers with `status`. */
class FakeStorage extends EventTarget {
  static last: FakeStorage | null = null
  static status = 200
  readonly upload = new EventTarget()
  readonly headers = new Map<string, string>()
  method = ''
  url = ''
  status = 0
  open(method: string, url: string) {
    this.method = method
    this.url = url
  }
  setRequestHeader(name: string, value: string) {
    this.headers.set(name, value)
  }
  abort() {
    this.dispatchEvent(new Event('abort'))
  }
  send(body: Blob) {
    FakeStorage.last = this
    this.upload.dispatchEvent(
      new ProgressEvent('progress', { lengthComputable: true, loaded: body.size / 2, total: body.size }),
    )
    this.status = FakeStorage.status
    this.dispatchEvent(new Event('load'))
  }
}

const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } })

afterEach(() => {
  vi.unstubAllGlobals()
  FakeStorage.status = 200
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
})
