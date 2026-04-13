import type { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { ACCESS_TOKEN_COOKIE_NAME, AUTH_COOKIE_NAMES, REFRESH_TOKEN_COOKIE_NAME } from './types';

interface CookieMutationOptions {
  domain?: string;
  expires?: Date;
  httpOnly?: boolean;
  maxAge?: number;
  path?: string;
  sameSite?: 'lax' | 'none' | 'strict';
  secure?: boolean;
}

interface ParsedSetCookie {
  name: string;
  options: CookieMutationOptions;
  value: string;
}

/**
 * Extract Set-Cookie header strings from a response.
 *
 * Uses the standard Headers.getSetCookie() API (available in Node 18+ and
 * Next.js 15+).  Returns an empty array when no cookies are present.
 */
export function getSetCookieHeaders(responseHeaders: Headers): string[] {
  return responseHeaders.getSetCookie();
}

function parseSameSite(value: string): CookieMutationOptions['sameSite'] | undefined {
  const normalized = value.toLowerCase();
  if (normalized === 'lax' || normalized === 'none' || normalized === 'strict') {
    return normalized;
  }
  return undefined;
}

function parseSetCookieHeader(setCookieHeader: string): ParsedSetCookie | null {
  const parts = setCookieHeader
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean);
  const [nameValue, ...attributes] = parts;

  if (!nameValue) return null;

  const separatorIndex = nameValue.indexOf('=');
  if (separatorIndex <= 0) return null;

  const name = nameValue.slice(0, separatorIndex).trim();
  const value = nameValue.slice(separatorIndex + 1);

  if (!name) return null;

  const options: CookieMutationOptions = {};

  for (const attribute of attributes) {
    const attributeSeparatorIndex = attribute.indexOf('=');
    const rawKey = attributeSeparatorIndex !== -1 ? attribute.slice(0, attributeSeparatorIndex) : attribute;
    const rawValue = attributeSeparatorIndex !== -1 ? attribute.slice(attributeSeparatorIndex + 1) : '';
    const key = rawKey.trim().toLowerCase();
    const optionValue = rawValue.trim();

    if (key === 'domain' && optionValue) {
      options.domain = optionValue;
    } else if (key === 'expires' && optionValue) {
      const expires = new Date(optionValue);
      if (!Number.isNaN(expires.getTime())) {
        options.expires = expires;
      }
    } else if (key === 'httponly') {
      options.httpOnly = true;
    } else if (key === 'max-age' && optionValue) {
      const maxAge = Number.parseInt(optionValue, 10);
      if (!Number.isNaN(maxAge)) {
        options.maxAge = maxAge;
      }
    } else if (key === 'path' && optionValue) {
      options.path = optionValue;
    } else if (key === 'samesite' && optionValue) {
      options.sameSite = parseSameSite(optionValue);
    } else if (key === 'secure') {
      options.secure = true;
    }
  }

  return { name, options, value };
}

export async function applyResponseCookies(responseHeaders: Headers): Promise<void> {
  const cookieStore = await cookies();

  for (const setCookieHeader of getSetCookieHeaders(responseHeaders)) {
    const parsed = parseSetCookieHeader(setCookieHeader);
    if (parsed) {
      cookieStore.set(parsed.name, parsed.value, parsed.options);
    }
  }
}

export function applyResponseCookiesToNextResponse(responseHeaders: Headers, response: NextResponse): void {
  for (const setCookieHeader of getSetCookieHeaders(responseHeaders)) {
    response.headers.append('set-cookie', setCookieHeader);
  }
}

export function buildRequestCookieHeader(request: NextRequest): string {
  return AUTH_COOKIE_NAMES.map((cookieName) => {
    const cookieValue = request.cookies.get(cookieName)?.value;
    return cookieValue ? `${cookieName}=${cookieValue}` : null;
  })
    .filter((value): value is string => value !== null)
    .join('; ');
}

export function buildCookieHeaderFromPairs(cookiePairs: Iterable<[string, string | undefined]>): string {
  const values: string[] = [];
  for (const [cookieName, cookieValue] of cookiePairs) {
    if (cookieValue) {
      values.push(`${cookieName}=${cookieValue}`);
    }
  }
  return values.join('; ');
}

export function clearAuthCookies(response: NextResponse): NextResponse {
  response.cookies.delete(ACCESS_TOKEN_COOKIE_NAME);
  response.cookies.delete({ name: REFRESH_TOKEN_COOKIE_NAME, path: '/api/auth/refresh' });
  return response;
}

/**
 * Decode the ``exp`` claim from an access token WITHOUT verifying the signature.
 *
 * Safe to call in the proxy / middleware context where we only need to know
 * whether to attempt a refresh.  Actual signature verification happens in
 * ``getSession()`` (server components) and ``proxy.ts`` (middleware).
 */
export function getAccessTokenExpiry(accessToken: string | undefined): number | null {
  if (!accessToken) return null;

  const [, payloadSegment] = accessToken.split('.');
  if (!payloadSegment) return null;

  try {
    const normalized = payloadSegment.replace(/-/g, '+').replace(/_/g, '/');
    const paddingLength = (4 - (normalized.length % 4)) % 4;
    const padded = `${normalized}${'='.repeat(paddingLength)}`;
    const payloadJson = atob(padded);
    const payload: unknown = JSON.parse(payloadJson);
    if (typeof payload !== 'object' || payload === null || !('exp' in payload)) {
      return null;
    }
    const expiry = (payload as { exp: unknown }).exp;
    return typeof expiry === 'number' ? expiry * 1000 : null;
  } catch {
    return null;
  }
}

export function isAccessTokenExpired(accessToken: string | undefined, now = Date.now()): boolean {
  const expiry = getAccessTokenExpiry(accessToken);
  if (expiry === null) return !accessToken;
  return expiry <= now;
}
