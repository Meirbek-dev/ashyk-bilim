import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getServerAPIUrl } from '@services/config/config';
import { apiFetch } from '@/lib/api-client';
import { REFRESH_TOKEN_COOKIE_NAME } from '@/lib/auth/types';
import {
  applyResponseCookiesToNextResponse,
  buildRequestCookieHeader,
  clearAuthCookies,
} from '@/lib/auth/cookie-bridge';
import { buildLoginRedirect, getPostAuthRedirect, isProtectedRoute, normalizeReturnTo } from '@/lib/auth/redirect';

/**
 * Token-refresh bridge — GET only.
 *
 * Why GET?  The refresh token cookie has ``Path: /api/auth/refresh``, so the
 * browser only sends it when navigating to a URL under that path.  When
 * ``proxy.ts`` detects an expired access token it redirects the browser here;
 * the browser follows the redirect with a GET, which finally includes the
 * refresh token cookie.  This handler then makes a server-side POST to
 * FastAPI's ``/auth/refresh`` endpoint (invisible to the browser) and
 * redirects the user back to their original destination with fresh cookies.
 *
 * This is a navigation endpoint, not a REST mutation endpoint — the GET
 * semantics are intentional and correct for this use-case.
 */
export async function GET(request: NextRequest) {
  const returnTo = normalizeReturnTo(request.nextUrl.searchParams.get('returnTo'));
  const cookieHeader = buildRequestCookieHeader(request);

  if (!cookieHeader.includes(`${REFRESH_TOKEN_COOKIE_NAME}=`)) {
    // No refresh token available — redirect to login so the user can re-authenticate.
    const target = isProtectedRoute(returnTo) ? buildLoginRedirect(returnTo) : getPostAuthRedirect(returnTo);
    return clearAuthCookies(NextResponse.redirect(new URL(target, request.url)));
  }

  // Server-side POST to FastAPI — never visible to the browser.
  const response = await apiFetch('auth/refresh', {
    method: 'POST',
    headers: cookieHeader ? { Cookie: cookieHeader } : undefined,
    cache: 'no-store',
  });

  if (!response.ok) {
    // Refresh rejected (revoked session, expired hard cap, etc.) — send to login.
    const target = isProtectedRoute(returnTo) ? buildLoginRedirect(returnTo) : getPostAuthRedirect(returnTo);
    return clearAuthCookies(NextResponse.redirect(new URL(target, request.url)));
  }

  // Apply the new access + refresh cookies to the redirect response so the
  // browser receives them alongside the navigation back to the original page.
  const redirectTarget = getPostAuthRedirect(returnTo);
  const redirectResponse = NextResponse.redirect(new URL(redirectTarget, request.url));
  applyResponseCookiesToNextResponse(response.headers, redirectResponse);
  return redirectResponse;
}
