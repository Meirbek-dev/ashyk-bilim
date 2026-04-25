/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loginAction, signupAction, logoutAction } from '@/app/actions/auth';

// Mock headers and cookies from Next.js
const mockCookies = {
  get: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
};
const mockHeaders = {
  get: vi.fn(),
};

vi.mock('next/headers', () => ({
  cookies: () => mockCookies,
  headers: () => mockHeaders,
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url) => {
    throw new Error(`REDIRECTED_TO:${url}`); // simulate redirect throwing
  }),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('@services/config/config', () => ({
  getServerAPIUrl: vi.fn(() => 'http://api.test/'),
}));

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('Frontend Auth Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
    mockHeaders.get.mockReturnValue('Mozilla/5.0');
  });

  describe('loginAction', () => {
    it('should successfully login and redirect', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({
          'set-cookie': 'access_token=123; HttpOnly; Path=/',
        }),
      });

      try {
        await loginAction({ email: 'test@example.com', password: 'password123' });
        expect.fail('Should have redirected');
      } catch (e: any) {
        expect(e.message).toBe('REDIRECTED_TO:/redirect_from_auth');
      }

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0]!;
      expect(url).toBe('http://api.test/auth/login');
      expect(options.method).toBe('POST');
      expect(options.body).toBeInstanceOf(URLSearchParams);
      expect(options.body.get('username')).toBe('test@example.com');
      expect(options.body.get('password')).toBe('password123');
    });

    it('should return login_failed on 401', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
      });

      const result = await loginAction({ email: 'test@example.com', password: 'wrong' });
      expect(result).toEqual({ ok: false, reason: 'login_failed' });
    });

    it('should return service_unavailable on 503', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
      });

      const result = await loginAction({ email: 'test@example.com', password: 'wrong' });
      expect(result).toEqual({ ok: false, reason: 'service_unavailable' });
    });

    it('should handle fetch exceptions as service_unavailable', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await loginAction({ email: 'test@example.com', password: 'wrong' });
      expect(result).toEqual({ ok: false, reason: 'service_unavailable' });
    });
  });

  describe('signupAction', () => {
    it('should successfully signup, login, and redirect', async () => {
      // Mock signup success
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });
      // Mock login success
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({
          'set-cookie': 'access_token=123; HttpOnly; Path=/',
        }),
      });

      try {
        await signupAction({
          email: 'new@example.com',
          firstName: 'John',
          lastName: 'Doe',
          password: 'password123',
        });
        expect.fail('Should have redirected');
      } catch (e: any) {
        expect(e.message).toBe('REDIRECTED_TO:/redirect_from_auth');
      }

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch.mock.calls[0]![0]).toBe('http://api.test/auth/register');
      expect(mockFetch.mock.calls[1]![0]).toBe('http://api.test/auth/login');
    });

    it('should handle signup failure with signupCode', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ detail: { code: 'REGISTER_USER_ALREADY_EXISTS' } }),
      });

      const result = await signupAction({
        email: 'exists@example.com',
        firstName: 'John',
        lastName: 'Doe',
        password: 'password123',
      });

      expect(result).toEqual({
        ok: false,
        reason: 'signup_failed',
        signupCode: 'REGISTER_USER_ALREADY_EXISTS',
      });
    });

    it('should handle login failure after signup', async () => {
      // Mock signup success
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });
      // Mock login failure
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
      });

      const result = await signupAction({
        email: 'new@example.com',
        firstName: 'John',
        lastName: 'Doe',
        password: 'password123',
      });

      expect(result).toEqual({
        ok: false,
        reason: 'login_after_signup_failed',
      });
    });
  });

  describe('logoutAction', () => {
    it('should fetch logout endpoint and redirect', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers(),
      });

      try {
        await logoutAction('/login');
        expect.fail('Should have redirected');
      } catch (e: any) {
        expect(e.message).toBe('REDIRECTED_TO:/'); 
      }

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch.mock.calls[0]![0]).toBe('http://api.test/auth/logout');
    });
  });
});
