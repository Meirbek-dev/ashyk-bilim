import { describe, it, expect, vi, beforeEach, afterEach } from 'vite-plus/test'
import { apiJson, apiResult } from '@/lib/api-client'
import { APIError, isApiError } from '@/lib/api/assertSuccess'

// Mock the config and auth redirect to avoid side effects
vi.mock('@services/config/config', () => ({
  getAPIUrl: () => 'http://localhost:8000/api/v2/',
  getServerAPIUrl: () => 'http://api:8000/api/v2/',
}))

const buildLoginRedirect = vi.fn((returnTo?: string | null) => `/login?returnTo=${encodeURIComponent(returnTo ?? '/')}`)
vi.mock('@/lib/auth/redirect', () => ({
  buildLoginRedirect: (returnTo?: string | null) => buildLoginRedirect(returnTo),
  isAuthRoute: () => false,
}))

function problem(body: Record<string, unknown>, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { 'Content-Type': 'application/problem+json', ...(init.headers ?? {}) },
  })
}

describe('apiJson timeout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = vi.fn()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('should abort the request when it exceeds DEFAULT_TIMEOUT_MS', async () => {
    // Mock fetch to reject when the signal is aborted
    ;(global.fetch as any).mockImplementation((_url: string | Request | URL, options: RequestInit | undefined) => {
      return new Promise((_, reject) => {
        if (options?.signal) {
          if (options.signal.aborted) {
            const error = new Error('The operation was aborted')
            error.name = 'AbortError'
            reject(error)
            return
          }
          options.signal.addEventListener(
            'abort',
            () => {
              const error = new Error('The operation was aborted')
              error.name = 'AbortError'
              reject(error)
            },
            { once: true },
          )
        }
      })
    })

    const promise = apiJson('test-endpoint')

    const rejection = expect(promise).rejects.toMatchObject({
      code: 'CLIENT_TIMEOUT',
      status: 0,
    })

    // Default GET requests retry once, so two 30s timeouts are expected.
    await vi.advanceTimersByTimeAsync(31000)
    await vi.advanceTimersByTimeAsync(200)
    await vi.advanceTimersByTimeAsync(31000)

    await rejection

    expect((global.fetch as any).mock.calls).toHaveLength(2)
    const lastCall = (global.fetch as any).mock.calls[1]
    const signal = lastCall[1].signal
    expect(signal.aborted).toBe(true)
  })

  it('should resolve normally if within timeout', async () => {
    ;(global.fetch as any).mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))

    const data = await apiJson<{ ok: boolean }>('test-endpoint')

    expect(data.ok).toBe(true)
  })

  it('targets the v2 base path with credentials', async () => {
    ;(global.fetch as any).mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))

    await apiJson('courses')

    const [url, init] = (global.fetch as any).mock.calls[0]
    expect(String(url)).toBe('http://localhost:8000/api/v2/courses')
    expect(init.credentials).toBe('include')
  })

  it('adds trace context headers to outgoing API requests', async () => {
    ;(global.fetch as any).mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))

    await apiJson('traced')

    const headers = new Headers((global.fetch as any).mock.calls[0][1].headers)
    expect(headers.get('traceparent')).toMatch(/^00-[\da-f]{32}-[\da-f]{16}-01$/u)
    expect(headers.get('x-request-id')).toBeTruthy()
  })

  it('retries an idempotent transient failure once', async () => {
    ;(global.fetch as any)
      .mockResolvedValueOnce(problem({ code: 'service-unavailable', status: 503, title: 'x', type: 'x' }, { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))

    const promise = apiJson<{ ok: boolean }>('flaky')
    await vi.advanceTimersByTimeAsync(200)

    await expect(promise).resolves.toEqual({ ok: true })
    expect((global.fetch as any).mock.calls).toHaveLength(2)
  })

  it('sends the browser to the login page on a 401 (no refresh dance)', async () => {
    const assign = vi.fn()
    vi.stubGlobal('location', { pathname: '/dash/courses', search: '', assign })
    ;(global.fetch as any).mockResolvedValue(
      problem({ code: 'unauthenticated', status: 401, title: 'Authentication required', type: 'x' }, { status: 401 }),
    )

    await expect(apiJson('needs-auth', { timeoutMs: false })).rejects.toMatchObject({
      code: 'unauthenticated',
      status: 401,
    })

    expect((global.fetch as any).mock.calls).toHaveLength(1)
    expect(assign).toHaveBeenCalledWith('/login?returnTo=%2Fdash%2Fcourses')
    vi.unstubAllGlobals()
  })

  it('throws APIError with problem+json metadata for non-2xx responses', async () => {
    ;(global.fetch as any).mockResolvedValue(
      problem(
        {
          type: 'https://docs.ashyq.example/errors/not-found',
          title: 'Not found',
          status: 404,
          code: 'not-found',
          detail: 'Course was not found',
          details: { course_id: 'course_123' },
          field_errors: [],
          request_id: 'req-course',
        },
        { status: 404, headers: { 'X-Request-ID': 'req-course' } },
      ),
    )

    await expect(apiJson('courses/course_123')).rejects.toMatchObject({
      code: 'not-found',
      message: 'Course was not found',
      details: { course_id: 'course_123' },
      requestId: 'req-course',
      status: 404,
    })
  })

  it('falls back to the status code when the body is not a problem document', async () => {
    ;(global.fetch as any).mockResolvedValue(new Response('<html>bad gateway</html>', { status: 502 }))

    await expect(apiJson('gateway', { timeoutMs: false, method: 'POST' })).rejects.toMatchObject({
      code: 'HTTP_502',
      status: 502,
    })
  })

  it('throws parser errors instead of returning invalid JSON data', async () => {
    ;(global.fetch as any).mockResolvedValue(new Response(JSON.stringify({ id: 123 }), { status: 200 }))

    await expect(
      apiJson('invalid-shape', {}, data => {
        if (!data || typeof data !== 'object' || typeof (data as { id?: unknown }).id !== 'string') {
          throw new Error('Response validation failed')
        }
        return data as { id: string }
      }),
    ).rejects.toThrow('Response validation failed')
  })

  it('apiResult exposes response headers (ETag versions) for 2xx responses', async () => {
    ;(global.fetch as any).mockResolvedValue(
      new Response(JSON.stringify({ id: 'draft-1' }), { status: 200, headers: { ETag: '"7"' } }),
    )

    const result = await apiResult<{ id: string }>('submissions/draft-1/draft')
    expect(result.data.id).toBe('draft-1')
    expect(result.headers.etag).toBe('"7"')
  })

  it('apiResult throws normalized API errors for non-2xx responses', async () => {
    ;(global.fetch as any).mockResolvedValue(
      problem(
        {
          type: 'x',
          title: 'Validation failed',
          status: 422,
          code: 'validation-failed',
          field_errors: [{ field: 'name', code: 'required', message: 'name is required' }],
          request_id: 'req-nope',
        },
        { status: 422 },
      ),
    )

    await expect(apiResult('nope')).rejects.toMatchObject({
      code: 'validation-failed',
      fieldErrors: [{ field: 'name', code: 'required', message: 'name is required' }],
      requestId: 'req-nope',
      status: 422,
    })
  })

  it('throws typed network errors when fetch rejects before a response exists', async () => {
    ;(global.fetch as any).mockRejectedValue(new TypeError('fetch failed'))

    await expect(apiJson('network-down', { method: 'POST', timeoutMs: false })).rejects.toMatchObject({
      code: 'NETWORK_UNAVAILABLE',
      status: 0,
    })
  })

  it('uses APIError instances for typed request failures', async () => {
    ;(global.fetch as any).mockResolvedValue(
      problem(
        { type: 'x', title: 'Too many requests', status: 429, code: 'rate-limited', request_id: 'req-rate' },
        { status: 429, headers: { 'X-Request-ID': 'req-rate', 'Retry-After': '60' } },
      ),
    )

    try {
      await apiJson('rate-limited', { method: 'POST' })
      throw new Error('Expected apiJson to throw')
    } catch (error) {
      expect(error).toBeInstanceOf(APIError)
      expect(isApiError(error)).toBe(true)
      expect(error).toMatchObject({ code: 'rate-limited', requestId: 'req-rate' })
      expect((error as APIError).retryAfterSeconds).toBe(60)
    }
  })
})
