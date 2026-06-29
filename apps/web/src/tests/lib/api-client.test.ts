import { describe, it, expect, vi, beforeEach, afterEach } from 'vite-plus/test'
import { apiFetch, apiJson } from '@/lib/api-client'
import { APIError, isApiError } from '@/lib/api/assertSuccess'

// Mock the config and auth redirect to avoid side effects
vi.mock('@services/config/config', () => ({
  getAPIUrl: () => 'http://localhost:8000/api/v1/',
  getServerAPIUrl: () => 'http://api:8000/api/v1/',
}))

vi.mock('@/lib/auth/redirect', () => ({
  buildLoginRedirect: (returnTo?: string | null) => `/login?returnTo=${encodeURIComponent(returnTo ?? '/')}`,
  isAuthRoute: () => false,
}))

describe('apiFetch timeout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = vi.fn()
    vi.useFakeTimers()
  })

  afterEach(() => {
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

    const promise = apiFetch('test-endpoint')

    // Move forward by 31 seconds (DEFAULT_TIMEOUT_MS is 30s)
    vi.advanceTimersByTime(31000)

    await expect(promise).rejects.toMatchObject({
      code: 'CLIENT_TIMEOUT',
      status: 0,
    })

    const lastCall = (global.fetch as any).mock.calls[0]
    const signal = lastCall[1].signal
    expect(signal.aborted).toBe(true)
  })

  it('should resolve normally if within timeout', async () => {
    ;(global.fetch as any).mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))

    const response = await apiFetch('test-endpoint')
    const data = await response.json()

    expect(data.ok).toBe(true)
  })

  it('should refresh once and retry concurrent 401 responses', async () => {
    const calls: string[] = []
    let originalRequestCount = 0
    ;(global.fetch as any).mockImplementation((url: string | Request | URL) => {
      const urlString = String(url)
      calls.push(urlString)

      if (urlString.startsWith('/api/auth/refresh')) {
        return Promise.resolve(new Response(JSON.stringify({ status: 'ok' }), { status: 200 }))
      }

      originalRequestCount += 1
      if (originalRequestCount <= 2) {
        return Promise.resolve(new Response(null, { status: 401 }))
      }

      return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    })

    const [first, second] = await Promise.all([
      apiFetch('needs-auth', { timeoutMs: false }),
      apiFetch('needs-auth', { timeoutMs: false }),
    ])

    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    expect(calls.filter(call => call.startsWith('/api/auth/refresh'))).toHaveLength(1)
  })

  it('throws APIError with backend envelope metadata for non-2xx JSON responses', async () => {
    ;(global.fetch as any).mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 'COURSE_NOT_FOUND',
          message: 'Course was not found',
          details: { course_uuid: 'course_123' },
          field_errors: [],
          request_id: 'req-course',
        }),
        {
          status: 404,
          headers: {
            'Content-Type': 'application/json',
            'X-Request-ID': 'req-course',
          },
        },
      ),
    )

    await expect(apiJson('courses/course_123')).rejects.toMatchObject({
      code: 'COURSE_NOT_FOUND',
      message: 'Course was not found',
      requestId: 'req-course',
      status: 404,
    })
  })

  it('throws typed network errors when fetch rejects before a response exists', async () => {
    ;(global.fetch as any).mockRejectedValue(new TypeError('fetch failed'))

    await expect(apiFetch('network-down', { timeoutMs: false })).rejects.toMatchObject({
      code: 'NETWORK_UNAVAILABLE',
      status: 0,
    })
  })

  it('uses APIError instances for typed request failures', async () => {
    ;(global.fetch as any).mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 'RATE_LIMITED',
          message: 'Too many requests',
          details: null,
          field_errors: [],
          request_id: 'req-rate',
        }),
        { status: 429, headers: { 'X-Request-ID': 'req-rate' } },
      ),
    )

    try {
      await apiJson('rate-limited')
      throw new Error('Expected apiJson to throw')
    } catch (error) {
      expect(error).toBeInstanceOf(APIError)
      expect(isApiError(error)).toBe(true)
      expect(error).toMatchObject({ code: 'RATE_LIMITED', requestId: 'req-rate' })
    }
  })
})
