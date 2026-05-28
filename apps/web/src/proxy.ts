import createMiddleware from 'next-intl/middleware'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { localePrefixes } from './i18n/config'
import { routing } from './i18n/routing'
import { isAccessTokenExpired } from './lib/auth/cookie-bridge'
import { ACCESS_TOKEN_COOKIE_NAME } from './lib/auth/types'
import { generateUUID } from './lib/utils'

const AUTH_REWRITE: Record<string, string> = {
  '/forgot': '/auth/forgot',
  '/login': '/auth/login',
  '/reset': '/auth/reset',
  '/signup': '/auth/signup',
}

const EDITOR_PATH_RE = /^\/course\/[\w-]+\/activity\/[\w-]+\/edit$/
const handleI18nRouting = createMiddleware(routing)

const PROTECTED_PREFIXES = [
  '/dash',
  '/profile',
  '/settings',
  '/admin',
  '/analytics',
  '/editor',
  '/certificates',
  '/assessments',
] as const

export const config = {
  matcher: [
    /*
     * Match app pages while leaving API routes, Next internals and public assets
     * untouched. Root files such as /favicon.ico are excluded, while dotted
     * dynamic route segments remain matchable.
     */
    '/((?!api|trpc|_next|_vercel|fonts|umami|examples|[\\w-]+\\.\\w+).*)',
    '/sitemap.xml',
  ],
}

const localePathPrefixes = [
  ...routing.locales.map(locale => [locale, `/${locale}`] as const),
  ...Object.entries(localePrefixes),
].toSorted(([, a], [, b]) => b.length - a.length)

function getPathInfo(pathname: string) {
  const match = localePathPrefixes.find(
    ([, prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  )

  if (!match) {
    return {
      locale: undefined,
      pathnameWithoutLocale: pathname,
    }
  }

  const [locale, prefix] = match

  return {
    locale,
    pathnameWithoutLocale: pathname.slice(prefix.length) || '/',
  }
}

function buildRequestHeaders(req: NextRequest, requestId: string, locale?: string) {
  const headers = new Headers(req.headers)

  headers.set(
    'x-forwarded-host',
    req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? req.nextUrl.host,
  )
  headers.set(
    'x-forwarded-proto',
    req.headers.get('x-forwarded-proto') ?? req.nextUrl.protocol.replace(':', ''),
  )
  headers.set('x-request-id', requestId)
  headers.set('x-pathname', req.nextUrl.pathname)
  headers.set('x-search', req.nextUrl.search)

  if (locale) {
    headers.set('x-next-intl-locale', locale)
  }

  if (req.nextUrl.port) {
    headers.set('x-forwarded-port', req.nextUrl.port)
  }

  return headers
}

function withRequestId(response: NextResponse, requestId: string) {
  response.headers.set('x-request-id', requestId)
  return response
}

function applyRequestHeaders(
  response: NextResponse,
  req: NextRequest,
  requestId: string,
  locale?: string,
) {
  const headerResponse = NextResponse.next({
    request: { headers: buildRequestHeaders(req, requestId, locale) },
  })
  const overrideHeaders = new Set(
    response.headers
      .get('x-middleware-override-headers')
      ?.split(',')
      .map(header => header.trim())
      .filter(Boolean),
  )

  headerResponse.headers.forEach((value, key) => {
    if (key.startsWith('x-middleware-request-')) {
      response.headers.set(key, value)
      overrideHeaders.add(key.slice('x-middleware-request-'.length))
    }
  })

  if (overrideHeaders.size > 0) {
    response.headers.set('x-middleware-override-headers', [...overrideHeaders].join(','))
  }

  return withRequestId(response, requestId)
}

function copyPublicResponseHeaders(source: Headers, target: NextResponse) {
  source.forEach((value, key) => {
    if (!key.startsWith('x-middleware-')) {
      target.headers.set(key, value)
    }
  })
}

function rewriteWithHeaders(
  req: NextRequest,
  requestId: string,
  pathname: string,
  locale?: string,
  responseHeaders?: Headers,
) {
  const response = NextResponse.rewrite(new URL(pathname, req.url), {
    request: { headers: buildRequestHeaders(req, requestId, locale) },
  })

  if (responseHeaders) {
    copyPublicResponseHeaders(responseHeaders, response)
  }

  return withRequestId(response, requestId)
}

function getPublicOrigin(req: NextRequest): string {
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? req.nextUrl.host
  const proto = (req.headers.get('x-forwarded-proto') ?? req.nextUrl.protocol).replace(':', '')
  return `${proto}://${host}`
}

function redirectToRefresh(req: NextRequest, requestId: string, pathname: string, search: string) {
  const returnTo = encodeURIComponent(pathname + search)
  return withRequestId(
    NextResponse.redirect(new URL(`/api/auth/refresh?returnTo=${returnTo}`, getPublicOrigin(req))),
    requestId,
  )
}

export default async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl
  const requestId = generateUUID()

  if (pathname.startsWith('/health')) {
    return rewriteWithHeaders(req, requestId, '/api/health')
  }

  if (pathname === '/redirect_from_auth') {
    const queryString = req.nextUrl.searchParams.toString()
    const redirectUrl = new URL('/', req.nextUrl.origin)
    if (queryString) {
      redirectUrl.search = queryString
    }
    return withRequestId(NextResponse.redirect(redirectUrl), requestId)
  }

  if (pathname.startsWith('/sitemap.xml')) {
    return rewriteWithHeaders(req, requestId, '/api/sitemap')
  }

  const i18nResponse = handleI18nRouting(req)
  withRequestId(i18nResponse, requestId)

  if (!i18nResponse.ok) {
    return i18nResponse
  }

  const resolvedUrl = new URL(i18nResponse.headers.get('x-middleware-rewrite') ?? req.url)
  const { locale, pathnameWithoutLocale } = getPathInfo(resolvedUrl.pathname)

  if (!locale) {
    return applyRequestHeaders(i18nResponse, req, requestId)
  }

  const authRewrite = AUTH_REWRITE[pathnameWithoutLocale]
  if (authRewrite) {
    return rewriteWithHeaders(
      req,
      requestId,
      `/${locale}${authRewrite}${search}`,
      locale,
      i18nResponse.headers,
    )
  }

  const isProtected =
    PROTECTED_PREFIXES.some(prefix => pathnameWithoutLocale.startsWith(prefix)) ||
    EDITOR_PATH_RE.test(pathnameWithoutLocale)
  if (isProtected) {
    const accessToken = req.cookies.get(ACCESS_TOKEN_COOKIE_NAME)?.value

    if (!accessToken || isAccessTokenExpired(accessToken)) {
      return redirectToRefresh(req, requestId, pathname, search)
    }
  }

  if (EDITOR_PATH_RE.test(pathnameWithoutLocale)) {
    return rewriteWithHeaders(
      req,
      requestId,
      `/${locale}/editor${pathnameWithoutLocale}${search}`,
      locale,
      i18nResponse.headers,
    )
  }

  return applyRequestHeaders(i18nResponse, req, requestId, locale)
}
