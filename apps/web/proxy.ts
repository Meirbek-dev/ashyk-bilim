import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { createRemoteJWKSet, errors as joseErrors, jwtVerify } from 'jose';
import { AUTH_REFRESH_BRIDGE_PATH, ACCESS_TOKEN_COOKIE_NAME } from './lib/auth/types';
import { isAccessTokenExpired } from './lib/auth/cookie-bridge';
import { generateUUID } from './lib/utils';

// ── JWKS (in-process cache via jose, re-fetched only on key rotation) ─────────

/**
 * The internal API URL is used for JWKS lookup — only available server-side.
 * Falls back to the public API URL (NEXT_PUBLIC_API_URL) in environments that
 * do not set INTERNAL_API_URL.
 *
 * If neither env var is set, JWKS_URL is null and the proxy falls back to
 * expiry-only checking (no signature verification).
 */
const _rawApiUrl: string = process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? '';

const JWKS_URL: URL | null = _rawApiUrl
  ? new URL('auth/.well-known/jwks.json', _rawApiUrl.endsWith('/') ? _rawApiUrl : `${_rawApiUrl}/`)
  : null;

/**
 * JWKS function created once at module load.  jose caches the fetched key in
 * memory and re-fetches only when it encounters an unknown KID.  Subsequent
 * requests have zero network overhead.
 */
const JWKS = JWKS_URL ? createRemoteJWKSet(JWKS_URL) : null;

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

  hdrs.set('x-forwarded-host', req.headers.get('host') ?? req.nextUrl.host);
  hdrs.set('x-forwarded-proto', req.nextUrl.protocol.replace(':', ''));
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

function redirectToRefresh(req: NextRequest, requestId: string, pathname: string, search: string) {
  const refreshUrl = new URL(AUTH_REFRESH_BRIDGE_PATH, req.url);
  refreshUrl.searchParams.set('returnTo', pathname + search);
  return withRequestId(NextResponse.redirect(refreshUrl), requestId);
}

/**
 * Verify the access token signature using the backend's JWKS.
 *
 * Returns true  → token is cryptographically valid (not necessarily fresh).
 * Returns false → token is invalid, expired, or JWKS is unavailable.
 *
 * The proxy performs signature verification as a lightweight first gate.
 * Full session validation (JTI blocklist, Redis session check) still happens
 * server-side in FastAPI on every authenticated API call.
 */
async function verifyTokenSignature(token: string): Promise<boolean> {
  if (!JWKS) {
    // JWKS not configured — fall back to expiry-only check
    return !isAccessTokenExpired(token);
  }
  try {
    await jwtVerify(token, JWKS, {
      issuer: 'ashyq-bilim-auth',
      audience: 'ashyq-bilim-api',
      algorithms: ['EdDSA'],
    });
    return true;
  } catch (error) {
    // JWTExpired is the normal case for a token that needs refresh
    if (error instanceof joseErrors.JWTExpired) return false;
    // Any other error (invalid signature, malformed) → reject
    return false;
  }
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
    // No token at all → go to refresh bridge
    if (!accessToken) {
      return redirectToRefresh(req, requestId, pathname, search);
    }
    // Quick expiry check (no network) before full signature verification
    if (isAccessTokenExpired(accessToken)) {
      return redirectToRefresh(req, requestId, pathname, search);
    }
    // Full signature verification via JWKS
    const valid = await verifyTokenSignature(accessToken);
    if (!valid) {
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
