import { describe, it, expect } from 'vite-plus/test'
import { buildLoginRedirect, isProtectedRoute, normalizeReturnTo, isAuthRoute } from '@/lib/auth/redirect'
import { getPathInfo, isEditorLegacyRoute, toInternalAuthPath, toInternalEditorPath } from '@/lib/auth/routes'

describe('Auth Redirect Logic', () => {
  describe('isProtectedRoute', () => {
    it('should identify protected routes correctly', () => {
      expect(isProtectedRoute('/dash')).toBe(true)
      expect(isProtectedRoute('/dash/settings')).toBe(true)
      expect(isProtectedRoute('/admin/users')).toBe(true)
      expect(isProtectedRoute('/editor/course/1')).toBe(true)
      expect(isProtectedRoute('/en/dash')).toBe(true)
      expect(isProtectedRoute('/ru/dash/courses')).toBe(true)
      expect(isProtectedRoute('/kz/assessments/assessment-1')).toBe(true)
    })

    it('should return false for public routes', () => {
      expect(isProtectedRoute('/')).toBe(false)
      expect(isProtectedRoute('/login')).toBe(false)
      expect(isProtectedRoute('/courses')).toBe(false)
      expect(isProtectedRoute('/administrator')).toBe(false)
      expect(isProtectedRoute('/analytics-preview')).toBe(false)
      expect(isProtectedRoute('/certificate-showcase')).toBe(false)
    })
  })

  describe('normalizeReturnTo', () => {
    it('should return / if returnTo is empty', () => {
      expect(normalizeReturnTo(null)).toBe('/')
      expect(normalizeReturnTo('')).toBe('/')
    })

    it('should prevent open redirects to external domains', () => {
      expect(normalizeReturnTo('https://evil.com/phish')).toBe('/')
      expect(normalizeReturnTo('//evil.com')).toBe('/')
      expect(normalizeReturnTo('/%2fevil.com')).toBe('/')
      expect(normalizeReturnTo('/dash\\evil')).toBe('/')
    })

    it('should allow internal redirects', () => {
      expect(normalizeReturnTo('/dash/overview')).toBe('/dash/overview')
      expect(normalizeReturnTo('/dash/overview?tab=active')).toBe('/dash/overview?tab=active')
    })

    it('should prevent redirects to auth routes to avoid loops', () => {
      expect(normalizeReturnTo('/login')).toBe('/')
      expect(normalizeReturnTo('/signup')).toBe('/')
      expect(normalizeReturnTo('/en/login')).toBe('/')
      expect(normalizeReturnTo('/en/auth/login')).toBe('/')
    })
  })

  describe('isAuthRoute', () => {
    it('should identify auth routes correctly', () => {
      expect(isAuthRoute('/login')).toBe(true)
      expect(isAuthRoute('/signup')).toBe(true)
      expect(isAuthRoute('/forgot/password')).toBe(true)
      expect(isAuthRoute('/en/login')).toBe(true)
      expect(isAuthRoute('/en/auth/login')).toBe(true)
    })

    it('should return false for non-auth routes', () => {
      expect(isAuthRoute('/dash')).toBe(false)
      expect(isAuthRoute('/')).toBe(false)
    })
  })

  describe('route rewrites', () => {
    it('should strip locale prefixes consistently', () => {
      expect(getPathInfo('/en/dash/courses')).toMatchObject({
        locale: 'en-US',
        localePrefix: '/en',
        pathnameWithoutLocale: '/dash/courses',
      })
      expect(getPathInfo('/ru-RU/dash')).toMatchObject({
        locale: 'ru-RU',
        localePrefix: '/ru-RU',
        pathnameWithoutLocale: '/dash',
      })
    })

    it('should resolve short auth routes to internal auth routes', () => {
      expect(toInternalAuthPath('/login')).toBe('/auth/login')
      expect(toInternalAuthPath('/en/login')).toBe('/en/auth/login')
      expect(toInternalAuthPath('/en/auth/login')).toBeNull()
    })

    it('should resolve legacy editor routes exactly', () => {
      expect(isEditorLegacyRoute('/course/course-1/activity/activity-1/edit')).toBe(true)
      expect(toInternalEditorPath('/en/course/course-1/activity/activity-1/edit')).toBe(
        '/en/editor/course/course-1/activity/activity-1/edit',
      )
      expect(isEditorLegacyRoute('/course/course-1/activity/activity-1/edit/extra')).toBe(false)
    })

    it('should build localized login redirects from localized return targets', () => {
      expect(buildLoginRedirect('/en/dash/courses?tab=active')).toBe(
        '/en/login?returnTo=%2Fen%2Fdash%2Fcourses%3Ftab%3Dactive',
      )
    })
  })
})
