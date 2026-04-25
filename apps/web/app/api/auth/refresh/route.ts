import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getServerAPIUrl } from '@services/config/config';
import {
  applyResponseCookiesToNextResponse,
  buildRequestCookieHeader,
  clearAuthCookies,
} from '@/lib/auth/cookie-bridge';
import { buildLoginRedirect, normalizeReturnTo } from '@/lib/auth/redirect';

function buildForwardedHeaders(request: NextRequest): Headers {
  const headers = new Headers();

  const userAgent = request.headers.get('user-agent');
  const forwardedFor = request.headers.get('x-forwarded-for');
  const forwardedHost = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  const forwardedProto = request.headers.get('x-forwarded-proto') ?? request.nextUrl.protocol.replace(':', '');

  if (userAgent) headers.set('user-agent', userAgent);
  if (forwardedFor) headers.set('x-forwarded-for', forwardedFor);
  if (forwardedHost) headers.set('x-forwarded-host', forwardedHost);
  if (forwardedProto) headers.set('x-forwarded-proto', forwardedProto);

  const cookieHeader = buildRequestCookieHeader(request);
  if (cookieHeader) {
    headers.set('cookie', cookieHeader);
  }

  return headers;
}

function redirectToLogin(request: NextRequest, returnTo: string): NextResponse {
  const response = NextResponse.redirect(new URL(buildLoginRedirect(returnTo), request.url));
  clearAuthCookies(response);
  return response;
}

export async function GET(request: NextRequest) {
  const returnTo = normalizeReturnTo(request.nextUrl.searchParams.get('returnTo'));

  let backendResponse: Response;
  try {
    backendResponse = await fetch(`${getServerAPIUrl()}auth/refresh`, {
      method: 'POST',
      headers: buildForwardedHeaders(request),
      cache: 'no-store',
      redirect: 'manual',
    });
  } catch {
    return redirectToLogin(request, returnTo);
  }

  if (!backendResponse.ok) {
    return redirectToLogin(request, returnTo);
  }

  const response = NextResponse.redirect(new URL(returnTo, request.url));
  applyResponseCookiesToNextResponse(backendResponse.headers, response);
  return response;
}
