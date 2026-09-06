/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vite-plus/test'
import { loginAction, logoutAction } from '@/app/actions/auth'
import { getSetCookieHeaders } from '@/lib/auth/cookie-bridge'

vi.mock('server-only', () => ({}))

// Mock headers and cookies from Next.js
const mockCookies = {
  get: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
}
const mockHeaders = {
  get: vi.fn(),
}

vi.mock('next/headers', () => ({
  cookies: () => mockCookies,
  headers: () => mockHeaders,
}))

vi.mock('next/navigation', () => ({
  redirect: vi.fn(url => {
    throw new Error(`REDIRECTED_TO:${url}`) // simulate redirect throwing
  }),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

vi.mock('@services/config/config', () => ({
  getServerAPIUrl: vi.fn(() => 'http://api.test/api/v2/'),
}))

// Mock global fetch
const mockFetch = vi.fn()
global.fetch = mockFetch

function problemResponse(status: number, code: string, headers: Record<string, string> = {}) {
  return {
    ok: false,
    status,
    headers: new Headers(headers),
    json: async () => ({ type: 'x', title: code, status, code }),
  }
}

describe('Frontend Auth Actions (v2 BFF)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch.mockReset()
    mockHeaders.get.mockReturnValue('Mozilla/5.0')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('cookie bridge', () => {
    it('extracts cookies from a plain combined set-cookie header', () => {
      const headers = {
        get: (key: string) =>
          key.toLowerCase() === 'set-cookie'
            ? 'ab_session=abc.123; HttpOnly; Path=/; SameSite=Lax, other=1; Path=/'
            : null,
      } as Headers

      expect(getSetCookieHeaders(headers)).toEqual([
        'ab_session=abc.123; HttpOnly; Path=/; SameSite=Lax',
        'other=1; Path=/',
      ])
    })
  })

  describe('loginAction', () => {
    it('posts JSON credentials, copies the session cookie and redirects', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({
          'set-cookie': 'ab_session=sess123; HttpOnly; Path=/; SameSite=Lax',
        }),
        json: async () => ({ user_id: 'u1', roles: ['user'], permissions: [] }),
      })

      try {
        await loginAction({ login: 'test@example.com', password: 'password123' })
        expect.fail('Should have redirected')
      } catch (e: any) {
        expect(e.message).toBe('REDIRECTED_TO:/redirect_from_auth')
      }

      expect(mockFetch).toHaveBeenCalledTimes(1)
      const [url, options] = mockFetch.mock.calls[0]!
      expect(url).toBe('http://api.test/api/v2/auth/login')
      expect(options.method).toBe('POST')
      expect(new Headers(options.headers).get('content-type')).toBe('application/json')
      expect(JSON.parse(options.body)).toEqual({ login: 'test@example.com', password: 'password123' })
      expect(mockCookies.set).toHaveBeenCalledWith(
        'ab_session',
        'sess123',
        expect.objectContaining({
          httpOnly: true,
          path: '/',
          sameSite: 'lax',
        }),
      )
    })

    it('honours returnTo on success', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({}),
      })

      await expect(
        loginAction({ login: 'user', password: 'password123', returnTo: '/dash/courses' }),
      ).rejects.toThrow('REDIRECTED_TO:/dash/courses')
    })

    it('resends the second factor as totp_code', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200, headers: new Headers(), json: async () => ({}) })

      await expect(loginAction({ login: 'user', password: 'pw', totpCode: ' 123456 ' })).rejects.toThrow(
        'REDIRECTED_TO:/redirect_from_auth',
      )

      expect(JSON.parse(mockFetch.mock.calls[0]![1].body)).toEqual({
        login: 'user',
        password: 'pw',
        totp_code: '123456',
      })
    })

    it('maps invalid-credentials (401) to invalid_credentials', async () => {
      mockFetch.mockResolvedValueOnce(problemResponse(401, 'invalid-credentials'))

      const result = await loginAction({ login: 'test@example.com', password: 'wrong' })
      expect(result).toEqual({ ok: false, reason: 'invalid_credentials', code: 'invalid-credentials' })
    })

    it('maps mfa-required (401) to the TOTP step', async () => {
      mockFetch.mockResolvedValueOnce(problemResponse(401, 'mfa-required'))

      const result = await loginAction({ login: 'test@example.com', password: 'pw' })
      expect(result).toEqual({ ok: false, reason: 'mfa_required', code: 'mfa-required' })
    })

    it('maps account-disabled (403) and rate-limited (429, Retry-After)', async () => {
      mockFetch.mockResolvedValueOnce(problemResponse(403, 'account-disabled'))
      expect(await loginAction({ login: 'a', password: 'b' })).toEqual({
        ok: false,
        reason: 'account_disabled',
        code: 'account-disabled',
      })

      mockFetch.mockResolvedValueOnce(problemResponse(429, 'rate-limited', { 'retry-after': '30' }))
      expect(await loginAction({ login: 'a', password: 'b' })).toEqual({
        ok: false,
        reason: 'rate_limited',
        code: 'rate-limited',
        retryAfterSeconds: 30,
      })
    })

    it('should return service_unavailable on 503', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 503, headers: new Headers(), json: async () => null })

      const result = await loginAction({ login: 'test@example.com', password: 'wrong' })
      expect(result).toEqual({ ok: false, reason: 'service_unavailable' })
    })

    it('should handle fetch exceptions as service_unavailable', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const result = await loginAction({ login: 'test@example.com', password: 'wrong' })
      expect(result).toEqual({ ok: false, reason: 'service_unavailable' })
    })
  })

  describe('logoutAction', () => {
    it('should post to the logout endpoint, drop the cookie and redirect', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        headers: new Headers(),
      })

      try {
        await logoutAction('/login')
        expect.fail('Should have redirected')
      } catch (e: any) {
        expect(e.message).toBe('REDIRECTED_TO:/')
      }

      expect(mockFetch).toHaveBeenCalledTimes(1)
      expect(mockFetch.mock.calls[0]![0]).toBe('http://api.test/api/v2/auth/logout')
      expect(mockFetch.mock.calls[0]![1].method).toBe('POST')
      expect(mockCookies.delete).toHaveBeenCalledWith('ab_session')
    })

    it('still clears the cookie when the backend is unreachable', async () => {
      mockFetch.mockRejectedValueOnce(new Error('down'))

      await expect(logoutAction('/')).rejects.toThrow('REDIRECTED_TO:/')
      expect(mockCookies.delete).toHaveBeenCalledWith('ab_session')
    })
  })
})
