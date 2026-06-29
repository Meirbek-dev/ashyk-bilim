import createMiddleware from 'next-intl/middleware'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { routing } from './i18n/routing'
import { getPathInfo, toInternalAuthPath, toInternalEditorPath } from './lib/auth/routes'
import { generateUUID } from './lib/utils'

const handleI18nRouting = createMiddleware(routing)

export const config = {
  matcher: [
    /*
     * Match app pages while leaving API routes, Next internals and public assets
     * untouched. Root files such as /favicon.ico are excluded, while dotted
     * dynamic route segments remain matchable.
     */
    '/((?!api|trpc|_next|_vercel|fonts|umami|examples|\\.well-known|[\\w-]+\\.\\w+).*)',
    '/sitemap.xml',
  ],
}

function buildRequestHeaders(req: NextRequest, requestId: string, locale?: string) {
  const headers = new Headers(req.headers)

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

function rewriteWithHeaders(req: NextRequest, requestId: string, pathname: string, locale?: string) {
  return withRequestId(
    NextResponse.rewrite(new URL(pathname, req.url), {
      request: { headers: buildRequestHeaders(req, requestId, locale) },
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

export function proxy(req: NextRequest) {
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

  if (pathname === '/redirect_from_auth') {
    const redirectUrl = new URL('/', req.nextUrl.origin)
    redirectUrl.search = req.nextUrl.search
    return withRequestId(NextResponse.redirect(redirectUrl), requestId)
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

  return attachRequestHeaders(i18nResponse, req, requestId, locale)
}
