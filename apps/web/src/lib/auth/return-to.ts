import { localePrefixes } from '@/i18n/config'
import { getPathInfo, isAuthRoute } from './routes'

function containsUnsafeCharacters(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i)
    if (code <= 0x1f || code === 0x7f || code === 0x5c) {
      return true
    }
  }
  return false
}

/**
 * Sanitizes a redirect target down to a safe same-origin path: must start
 * with a single `/`, no control characters, no protocol-relative `//`, no
 * encoded-slash tricks, and it must parse to the same (fake) origin it was
 * resolved against — anything else collapses to `/`. Unlike
 * `normalizeReturnTo`, this does NOT exclude auth routes, because not every
 * caller wants that: a post-logout redirect legitimately targets `/login`.
 */
export function normalizeInternalPath(path: string | null | undefined): string {
  if (!path) return '/'

  const trimmed = path.trim()
  if (!trimmed || containsUnsafeCharacters(trimmed)) return '/'
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return '/'
  if (/^\/%2f/i.test(trimmed)) return '/'

  let parsed: URL
  try {
    parsed = new URL(trimmed, 'http://local.invalid')
  } catch {
    return '/'
  }

  if (parsed.origin !== 'http://local.invalid') return '/'

  return `${parsed.pathname}${parsed.search}` || '/'
}

/**
 * Sanitizes a post-LOGIN `returnTo` target: same safety checks as
 * `normalizeInternalPath`, plus auth routes are rejected (mapped to `/`) so
 * a crafted `?returnTo=/login` can't bounce the user straight back to the
 * login page in a loop.
 */
export function normalizeReturnTo(returnTo: string | null | undefined): string {
  const normalized = normalizeInternalPath(returnTo)
  return isAuthRoute(normalized) ? '/' : normalized
}

export function buildReturnTo(pathname: string | null | undefined, search?: string | null): string {
  if (!pathname) return '/'
  return normalizeReturnTo(`${pathname}${search ?? ''}`)
}

export function buildLoginRedirect(returnTo?: string | null): string {
  const resolved = normalizeReturnTo(returnTo)
  const { localePrefix } = getPathInfo(resolved)
  const loginPath = `${localePrefix}/login`
  return `${loginPath}?returnTo=${encodeURIComponent(resolved)}`
}

/**
 * Post-login destination: the sanitized `returnTo`, prefixed with the active
 * locale when it carries none (`/` → `/ru`). Never an unprefixed path: the
 * client router keeps the action's redirect URL as-is, so anything the
 * middleware has to rewrite ends up as a stale address bar (BUG-023).
 */
export function getPostAuthRedirect(returnTo: string | null | undefined, locale?: string | null): string {
  const normalized = normalizeReturnTo(returnTo)
  const prefix = locale && locale in localePrefixes ? localePrefixes[locale as keyof typeof localePrefixes] : ''
  if (!prefix || getPathInfo(normalized).locale) return normalized
  return normalized === '/' ? prefix : `${prefix}${normalized}`
}
