import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { ACCESS_TOKEN_COOKIE_NAME } from './lib/auth/types';
import { isAccessTokenExpired } from './lib/auth/cookie-bridge';
import { generateUUID } from './lib/utils';

// ── JWKS (Removed) ─────────
// We no longer verify the signature on the Edge using JWKS.
// ── Route tables ──────────────────────────────────────────────────────────────

const AUTH_REWRITE: Record<string, string> = {
  '/forgot': '/auth/forgot',
  '/login': '/auth/login',
  '/reset': '/auth/reset',
  '/signup': '/auth/signup',
};

const EDITOR_PATH_RE = /^\/course\/[\w-]+\/activity\/[\w-]+\/edit$/;

/**
 * Route prefixes that require an authenticated session.
 * Unauthenticated requests are redirected to /login with a ?returnTo param
 * so the user lands back at their intended destination after signing in.
 */
const PROTECTED_PREFIXES = [
  '/dash',
  '/profile',
  '/settings',
  '/admin',
  '/analytics',
  '/editor',
  '/certificates',
] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildRequestHeaders(req: NextRequest, requestId: string) {
  const hdrs = new Headers(req.headers);

  hdrs.set('x-forwarded-host', req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? req.nextUrl.host);
  hdrs.set('x-forwarded-proto', req.headers.get('x-forwarded-proto') ?? req.nextUrl.protocol.replace(':', ''));
  hdrs.set('x-request-id', requestId);
  // x-pathname is read by requireSession() to build the returnTo redirect URL.
  hdrs.set('x-pathname', req.nextUrl.pathname);

  if (req.nextUrl.port) {
    hdrs.set('x-forwarded-port', req.nextUrl.port);
  }

  return hdrs;
}

function withRequestId(response: NextResponse, requestId: string) {
  response.headers.set('x-request-id', requestId);
  return response;
}

function nextWithHeaders(req: NextRequest, requestId: string) {
  return withRequestId(
    NextResponse.next({
      request: { headers: buildRequestHeaders(req, requestId) },
    }),
    requestId,
  );
}

function rewriteWithHeaders(req: NextRequest, requestId: string, pathname: string) {
  return withRequestId(
    NextResponse.rewrite(new URL(pathname, req.url), {
      request: { headers: buildRequestHeaders(req, requestId) },
    }),
    requestId,
  );
}

function getPublicOrigin(req: NextRequest): string {
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? req.nextUrl.host;
  const proto = (req.headers.get('x-forwarded-proto') ?? req.nextUrl.protocol).replace(':', '');
  return `${proto}://${host}`;
}

function redirectToRefresh(req: NextRequest, requestId: string, pathname: string, search: string) {
  const returnTo = encodeURIComponent(pathname + search);
  return withRequestId(
    NextResponse.redirect(new URL(`/api/auth/refresh?returnTo=${returnTo}`, getPublicOrigin(req))),
    requestId,
  );
}

// ── Proxy ─────────────────────────────────────────────────────────────────────

export const config = {
  matcher: [
    /*
     * Match all paths except for:
     * 1. /api routes
     * 2. /_next (Next.js internals)
     * 3. /fonts (inside /public)
     * 4. Umami Analytics
     * 5. /examples (inside /public)
     * 6. all root files inside /public (e.g. /favicon.ico)
     */
    '/((?!api|_next|fonts|umami|examples|[\\w-]+\\.\\w+).*)',
    // Keep sitemap explicit so it still hits the proxy even though the regex skips extension paths.
    '/sitemap.xml',
  ],
};

export default async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const requestId = generateUUID();
  const accessToken = req.cookies.get(ACCESS_TOKEN_COOKIE_NAME)?.value;

  if (pathname === '/home') {
    return rewriteWithHeaders(req, requestId, `${pathname}${search}`);
  }

  const authRewrite = AUTH_REWRITE[pathname];
  if (authRewrite) {
    return rewriteWithHeaders(req, requestId, `${authRewrite}${search}`);
  }

  const isProtected = PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix)) || EDITOR_PATH_RE.test(pathname);
  if (isProtected) {
    // Missing or expired access cookies should pass through the refresh bridge first.
    if (!accessToken) {
      return redirectToRefresh(req, requestId, pathname, search);
    }
    if (isAccessTokenExpired(accessToken)) {
      return redirectToRefresh(req, requestId, pathname, search);
    }
  }

  // Dynamic Pages Editor
  if (EDITOR_PATH_RE.test(pathname)) {
    return rewriteWithHeaders(req, requestId, `/editor${pathname}`);
  }

  // Health Check
  if (pathname.startsWith('/health')) {
    return rewriteWithHeaders(req, requestId, '/api/health');
  }

  // Auth Redirects
  if (pathname === '/redirect_from_auth') {
    const { searchParams } = req.nextUrl;
    const queryString = searchParams.toString();
    const redirectUrl = new URL('/', req.nextUrl.origin);
    if (queryString) {
      redirectUrl.search = queryString;
    }
    return withRequestId(NextResponse.redirect(redirectUrl), requestId);
  }

  if (pathname.startsWith('/sitemap.xml')) {
    return rewriteWithHeaders(req, requestId, '/api/sitemap');
  }

  return nextWithHeaders(req, requestId);
}
