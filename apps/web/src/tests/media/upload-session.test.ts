/** @vitest-environment jsdom */
// A session that ends during an upload: no redirect to /login while the file is on its way or waits for its
// finalize; «Повторить» (after signing in in another tab) finalizes the stored file without sending it again.
import { afterEach, beforeEach, expect, it, vi } from 'vite-plus/test'

vi.mock('@services/config/config', () => ({
  getAPIUrl: () => 'http://localhost:8000/api/v2/',
  getServerAPIUrl: () => 'http://api:8000/api/v2/',
}))
vi.mock('@/lib/auth/redirect', () => ({
  buildLoginRedirect: (returnTo?: string | null) => `/login?returnTo=${encodeURIComponent(returnTo ?? '/')}`,
  isAuthRoute: () => false,
}))

const SLOT = { id: '01a09100-0000-7000-8000-0000000000e1', key: 'course-thumbnail/k', put_url: 'http://s3/put' }
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const expired = () => json({ code: 'session-expired', status: 401, title: 'Session expired', type: 'x' }, 401)

let signedIn = false
let stored = Promise.withResolvers<void>()
const calls: string[] = []
const assign = vi.fn()

beforeEach(() => {
  signedIn = false
  stored = Promise.withResolvers<void>()
  calls.length = 0
  assign.mockClear()
  vi.resetModules()
  vi.stubGlobal('location', { pathname: '/dash/courses/c/general', search: '', assign })
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input)
      const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
      const name = url === SLOT.put_url ? 'put' : (url.split('/').pop() ?? '')
      calls.push(name)
      if (name === 'put') {
        await stored.promise
        return new Response(null, { status: 200 })
      }
      if (name === 'uploads' && method === 'POST') return json(SLOT)
      if (name === 'finalize') return signedIn ? json({ id: SLOT.id, key: SLOT.key, size_bytes: 4 }) : expired()
      return signedIn ? json({}) : expired()
    }),
  )
})
afterEach(() => vi.unstubAllGlobals())

it('a 401 elsewhere and at finalize keeps the page; «Повторить» finalizes the stored file once signed in', async () => {
  const { apiJson } = await import('@/lib/api-client')
  const { uploadFile } = await import('@services/media/uploads')
  const hold = await import('@/lib/auth/upload-hold')
  const upload = uploadFile(new File(['abcd'], 'c.png', { type: 'image/png' }), 'course-thumbnail')
  await vi.waitFor(() => expect(calls).toContain('put'))

  // Another request of the page answers 401 while the bytes are on their way.
  await expect(apiJson('courses/c', { timeoutMs: false })).rejects.toMatchObject({ status: 401 })
  expect(assign).not.toHaveBeenCalled()
  expect(hold.uploadSessionExpired()).toBe(true)

  stored.resolve()
  await vi.waitFor(() => expect(calls.filter(call => call === 'finalize')).toHaveLength(1))
  expect(assign).not.toHaveBeenCalled()

  signedIn = true
  hold.retryAfterSignIn()
  await expect(upload).resolves.toMatchObject({ id: SLOT.id })
  expect(calls.filter(call => call === 'put')).toHaveLength(1)
  expect(calls.filter(call => call === 'finalize')).toHaveLength(2)
  expect(hold.uploadSessionExpired()).toBe(false)
  expect(assign).not.toHaveBeenCalled()
})

it('a cancelled upload while signed out hands over to the ordinary redirect to /login', async () => {
  const { uploadFile } = await import('@services/media/uploads')
  const controller = new AbortController()
  stored.resolve()
  const upload = uploadFile(new File(['abcd'], 'c.png', { type: 'image/png' }), 'course-thumbnail', {
    signal: controller.signal,
  })
  await vi.waitFor(() => expect(calls).toContain('finalize'))
  expect(assign).not.toHaveBeenCalled()
  controller.abort()
  await expect(upload).rejects.toMatchObject({ code: 'REQUEST_ABORTED' })
  expect(assign).toHaveBeenCalledWith('/login?returnTo=%2Fdash%2Fcourses%2Fc%2Fgeneral')
})
