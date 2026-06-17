export { isAuthRoute, isProtectedRoute } from './routes'
export { getPostAuthRedirect, normalizeReturnTo } from './return-to'
import { buildLoginRedirect as buildLoginRedirectForReturnTo } from './return-to'

// ── Redirect helpers ──────────────────────────────────────────────────────────

export function getCurrentReturnTo(): string {
  if (typeof globalThis.window === 'undefined') return '/'
  const { pathname, search } = globalThis.location
  return `${pathname}${search}` || '/'
}

export function buildLoginRedirect(returnTo?: string | null): string {
  return buildLoginRedirectForReturnTo(returnTo ?? getCurrentReturnTo())
}
