import { localePrefixes, locales } from '@/i18n/config'

const AUTH_ALIAS_TO_INTERNAL = {
  '/forgot': '/auth/forgot',
  '/login': '/auth/login',
  '/reset': '/auth/reset',
  '/signup': '/auth/signup',
} as const

const AUTH_ALIAS_PREFIXES = Object.keys(AUTH_ALIAS_TO_INTERNAL)
const INTERNAL_AUTH_PREFIXES = ['/auth/forgot', '/auth/login', '/auth/reset', '/auth/signup'] as const

export const PROTECTED_ROUTE_PREFIXES = [
  '/dash',
  '/profile',
  '/settings',
  '/admin',
  '/analytics',
  '/editor',
  '/certificates',
  '/assessments',
] as const

const EDITOR_LEGACY_PATH_RE = /^\/course\/[\w-]+\/activity\/[\w-]+\/edit$/

const localePathPrefixes = [
  ...locales.map(locale => [locale, `/${locale}`] as const),
  ...Object.entries(localePrefixes),
].toSorted(([, a], [, b]) => b.length - a.length)

export interface PathInfo {
  locale: string | undefined
  localePrefix: string
  pathnameWithoutLocale: string
}

function ensurePathname(value: string): string {
  const pathname = value.split(/[?#]/, 1)[0] || '/'
  if (pathname.startsWith('/')) return pathname
  return `/${pathname}`
}

export function getPathInfo(pathname: string): PathInfo {
  const normalizedPathname = ensurePathname(pathname)
  const match = localePathPrefixes.find(
    ([, prefix]) => normalizedPathname === prefix || normalizedPathname.startsWith(`${prefix}/`),
  )

  if (!match) {
    return {
      locale: undefined,
      localePrefix: '',
      pathnameWithoutLocale: normalizedPathname,
    }
  }

  const [locale, prefix] = match

  return {
    locale,
    localePrefix: prefix,
    pathnameWithoutLocale: normalizedPathname.slice(prefix.length) || '/',
  }
}

export function hasPathPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`)
}

export function isAuthRoute(pathname: string): boolean {
  const { pathnameWithoutLocale } = getPathInfo(pathname)
  return (
    AUTH_ALIAS_PREFIXES.some(prefix => hasPathPrefix(pathnameWithoutLocale, prefix)) ||
    INTERNAL_AUTH_PREFIXES.some(prefix => hasPathPrefix(pathnameWithoutLocale, prefix))
  )
}

export function isProtectedRoute(pathname: string): boolean {
  const { pathnameWithoutLocale } = getPathInfo(pathname)
  return PROTECTED_ROUTE_PREFIXES.some(prefix => hasPathPrefix(pathnameWithoutLocale, prefix))
}

export function toInternalAuthPath(pathname: string): string | null {
  const { localePrefix, pathnameWithoutLocale } = getPathInfo(pathname)
  const internalPath = AUTH_ALIAS_TO_INTERNAL[pathnameWithoutLocale as keyof typeof AUTH_ALIAS_TO_INTERNAL]
  return internalPath ? `${localePrefix}${internalPath}` : null
}

export function isEditorLegacyRoute(pathname: string): boolean {
  return EDITOR_LEGACY_PATH_RE.test(getPathInfo(pathname).pathnameWithoutLocale)
}

export function toInternalEditorPath(pathname: string): string | null {
  const { localePrefix, pathnameWithoutLocale } = getPathInfo(pathname)
  return EDITOR_LEGACY_PATH_RE.test(pathnameWithoutLocale) ? `${localePrefix}/editor${pathnameWithoutLocale}` : null
}
