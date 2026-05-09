import { describe, it, expect } from 'vitest';
import { isProtectedRoute, normalizeReturnTo, isAuthRoute } from '@/lib/auth/redirect';

describe('Auth Redirect Logic', () => {
  describe('isProtectedRoute', () => {
    it('should identify protected routes correctly', () => {
      expect(isProtectedRoute('/dash')).toBe(true);
      expect(isProtectedRoute('/dash/settings')).toBe(true);
      expect(isProtectedRoute('/admin/users')).toBe(true);
      expect(isProtectedRoute('/editor/course/1')).toBe(true);
    });

    it('should return false for public routes', () => {
      expect(isProtectedRoute('/')).toBe(false);
      expect(isProtectedRoute('/login')).toBe(false);
      expect(isProtectedRoute('/courses')).toBe(false);
    });
  });

  describe('normalizeReturnTo', () => {
    it('should return / if returnTo is empty', () => {
      expect(normalizeReturnTo(null)).toBe('/');
      expect(normalizeReturnTo('')).toBe('/');
    });

    it('should prevent open redirects to external domains', () => {
      expect(normalizeReturnTo('https://evil.com/phish')).toBe('/');
      expect(normalizeReturnTo('//evil.com')).toBe('/');
    });

    it('should allow internal redirects', () => {
      expect(normalizeReturnTo('/dash/overview')).toBe('/dash/overview');
      expect(normalizeReturnTo('/dash/overview?tab=active')).toBe('/dash/overview?tab=active');
    });

    it('should prevent redirects to auth routes to avoid loops', () => {
      expect(normalizeReturnTo('/login')).toBe('/');
      expect(normalizeReturnTo('/signup')).toBe('/');
    });
  });

  describe('isAuthRoute', () => {
    it('should identify auth routes correctly', () => {
      expect(isAuthRoute('/login')).toBe(true);
      expect(isAuthRoute('/signup')).toBe(true);
      expect(isAuthRoute('/forgot/password')).toBe(true);
    });

    it('should return false for non-auth routes', () => {
      expect(isAuthRoute('/dash')).toBe(false);
      expect(isAuthRoute('/')).toBe(false);
    });
  });
});
