import createMiddleware from 'next-intl/middleware'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { routing } from './i18n/routing'
import { getPathInfo, toInternalAuthPath, toInternalEditorPath } from './lib/auth/routes'
import { generateUUID } from './lib/utils'
import { MISSING_HEADERS, isMissingResource, resourceProbe } from './lib/missing-resource'
import { getServerAPIUrl } from './services/config/config'

const handleI18nRouting = createMiddleware(routing)

/** `/kk/...` (the ISO code people type) and the full tags lead to the configured prefixes; next-intl would prefix them again (`/kz/kk/...`, a 404). */
const LOCALE_ALIASES: Record<string, string> = { kk: 'kz', 'kk-kz': 'kz', 'ru-ru': 'ru', 'en-us': 'en' }

export const config = {
  matcher: [
    /*
     * Match app pages while leaving API routes, Next internals and public assets
     * untouched. Root files such as /favicon.ico are excluded, while dotted
     * dynamic route segments remain matchable.
     */
    '/((?!api|content|trpc|_next|_vercel|fonts|brand/|umami|examples|\\.well-known|[\\w-]+\\.\\w+).*)',
    '/sitemap.xml',
  ],
}

function buildRequestHeaders(req: NextRequest, requestId: string, locale?: string, extra?: Record<string, string>) {
  const headers = new Headers(req.headers)
  for (const [key, value] of Object.entries(extra ?? {})) headers.set(key, value)

  headers.set('x-request-id', requestId)
  headers.set('x-pathname', req.nextUrl.pathname)
  headers.set('x-search', req.nextUrl.search)

  if (locale) {
    headers.set('x-next-intl-locale', locale)
  }

  return headers
}

function withRequestId(response: NextResponse, requestId: string) {
  response.headers.set('x-request-id', requestId)
  return response
}

function attachRequestHeaders(response: NextResponse, req: NextRequest, requestId: string, locale?: string) {
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

function rewriteWithHeaders(
  req: NextRequest,
  requestId: string,
  pathname: string,
  locale?: string,
  extra?: Record<string, string>,
) {
  return withRequestId(
    NextResponse.rewrite(new URL(pathname, req.url), {
      request: { headers: buildRequestHeaders(req, requestId, locale, extra) },
    }),
    requestId,
  )
}

function getResolvedPathname(req: NextRequest, response: NextResponse): string {
  const rewrite = response.headers.get('x-middleware-rewrite')
  return rewrite ? new URL(rewrite).pathname : req.nextUrl.pathname
}

function isWellKnownPath(pathname: string): boolean {
  return pathname === '/.well-known' || pathname.startsWith('/.well-known/')
}

export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl
  const requestId = generateUUID()

  if (pathname === '/health' || pathname.startsWith('/health/')) {
    return rewriteWithHeaders(req, requestId, '/api/health')
  }

  if (pathname.includes('/.well-known')) {
    const { pathnameWithoutLocale } = getPathInfo(pathname)
    if (pathname !== pathnameWithoutLocale) {
      return withRequestId(NextResponse.redirect(new URL(pathnameWithoutLocale, req.url)), requestId)
    }
    return withRequestId(NextResponse.next(), requestId)
  }

  const [, first = '', ...rest] = pathname.split('/')
  const alias = LOCALE_ALIASES[first.toLowerCase()]
  if (alias) {
    const target = new URL(['', alias, ...rest].join('/') + search, req.url)
    return withRequestId(NextResponse.redirect(target, 308), requestId)
  }

  if (pathname === '/sitemap.xml') {
    return rewriteWithHeaders(req, requestId, '/api/sitemap')
  }

  const i18nResponse = handleI18nRouting(req)
  if (!i18nResponse.ok) {
    return withRequestId(i18nResponse, requestId)
  }

  const resolvedPathname = getResolvedPathname(req, i18nResponse)
  const { locale } = getPathInfo(resolvedPathname)

  if (isWellKnownPath(getPathInfo(resolvedPathname).pathnameWithoutLocale)) {
    return attachRequestHeaders(i18nResponse, req, requestId, locale)
  }

  const authRewrite = toInternalAuthPath(resolvedPathname)
  if (authRewrite) {
    return rewriteWithHeaders(req, requestId, `${authRewrite}${search}`, locale)
  }

  const editorRewrite = toInternalEditorPath(resolvedPathname)
  if (editorRewrite) {
    return rewriteWithHeaders(req, requestId, `${editorRewrite}${search}`, locale)
  }

  // ROUND3-17: a missing course / lesson / collection / profile answers HTTP 404 (see lib/missing-resource).
  // Prefetches skip the probe; the navigation itself is checked.
  const probe =
    req.method === 'GET' && !req.headers.has('next-router-prefetch')
      ? resourceProbe(getPathInfo(resolvedPathname).pathnameWithoutLocale)
      : null
  if (probe && (await isMissingResource(probe, getServerAPIUrl(), req.headers.get('cookie')))) {
    // Nothing matches `…/__missing`, so Next renders `[locale]/not-found.tsx` with a real 404.
    return rewriteWithHeaders(req, requestId, `${resolvedPathname.replace(/\/$/, '')}/__missing`, locale, {
      [MISSING_HEADERS.kind]: probe.kind,
      ...(probe.courseId ? { [MISSING_HEADERS.course]: probe.courseId } : {}),
      ...(req.cookies.has('ab_session') ? {} : { [MISSING_HEADERS.guest]: '1' }),
    })
  }

  return attachRequestHeaders(i18nResponse, req, requestId, locale)
}
