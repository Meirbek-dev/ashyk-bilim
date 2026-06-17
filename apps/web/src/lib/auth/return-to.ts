import { getPathInfo, isAuthRoute } from './routes'

function containsUnsafeCharacters(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i)
    if (code <= 0x1F || code === 0x7F || code === 0x5C) {
      return true
    }
  }
  return false
}

export function normalizeReturnTo(returnTo: string | null | undefined): string {
  if (!returnTo) return '/'

  const trimmed = returnTo.trim()
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

  const normalizedPath = `${parsed.pathname}${parsed.search}` || '/'
  return isAuthRoute(parsed.pathname) ? '/' : normalizedPath
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

export function getPostAuthRedirect(returnTo: string | null | undefined): string {
  const normalized = normalizeReturnTo(returnTo)
  return normalized === '/' ? '/redirect_from_auth' : normalized
}
