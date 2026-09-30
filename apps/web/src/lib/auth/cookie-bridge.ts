import type { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { AUTH_COOKIE_NAMES, SESSION_COOKIE_NAME } from './types'

/**
 * Cookie bridge between the Rust BFF and the Next.js server runtime.
 *
 * Login/logout run as server actions (so the backend can stay on an internal
 * URL); the `Set-Cookie` headers the backend answers with are copied onto the
 * Next response so the browser receives the `ab_session` cookie on the app
 * origin. There is exactly one cookie and no refresh token (ARCHITECTURE §7).
 */

interface CookieMutationOptions {
  domain?: string
  expires?: Date
  httpOnly?: boolean
  maxAge?: number
  path?: string
  sameSite?: 'lax' | 'none' | 'strict'
  secure?: boolean
}

interface ParsedSetCookie {
  name: string
  options: CookieMutationOptions
  value: string
}

interface SetCookieHeaderSource {
  getSetCookie?: () => string[]
  raw?: () => Record<string, string[] | undefined>
}

/**
 * Extract Set-Cookie header strings from a response.
 *
 * Runtime header implementations differ here: modern undici exposes
 * getSetCookie(), older server fetch shims expose raw(), and test/edge-like
 * Headers may only expose a combined set-cookie value through get().
 */
export function getSetCookieHeaders(responseHeaders: Headers): string[] {
  const headerSource = responseHeaders as SetCookieHeaderSource

  if (typeof headerSource.getSetCookie === 'function') {
    const values = headerSource.getSetCookie().filter(Boolean)
    if (values.length > 0) return values
  }

  if (typeof headerSource.raw === 'function') {
    const rawSetCookies = headerSource.raw()['set-cookie']?.filter(Boolean) ?? []
    if (rawSetCookies.length > 0) return rawSetCookies
  }

  const combinedSetCookie = responseHeaders.get('set-cookie')
  return combinedSetCookie ? splitCombinedSetCookieHeader(combinedSetCookie) : []
}

function splitCombinedSetCookieHeader(header: string): string[] {
  return header
    .split(/,(?=\s*[!#$%&'*+\-.^_`|~0-9A-Za-z]+=)/)
    .map(value => value.trim())
    .filter(Boolean)
}

function parseSameSite(value: string): CookieMutationOptions['sameSite'] | undefined {
  const normalized = value.toLowerCase()
  if (normalized === 'lax' || normalized === 'none' || normalized === 'strict') {
    return normalized
  }
  return undefined
}

function parseSetCookieHeader(setCookieHeader: string): ParsedSetCookie | null {
  const parts: string[] = []
  for (const part of setCookieHeader.split(';')) {
    const trimmed = part.trim()
    if (trimmed) {
      parts.push(trimmed)
    }
  }
  const [nameValue, ...attributes] = parts

  if (!nameValue) return null

  const separatorIndex = nameValue.indexOf('=')
  if (separatorIndex <= 0) return null

  const name = nameValue.slice(0, separatorIndex).trim()
  const value = nameValue.slice(separatorIndex + 1)

  if (!name) return null

  const options: CookieMutationOptions = {}

  for (const attribute of attributes) {
    const attributeSeparatorIndex = attribute.indexOf('=')
    const rawKey = attributeSeparatorIndex !== -1 ? attribute.slice(0, attributeSeparatorIndex) : attribute
    const rawValue = attributeSeparatorIndex !== -1 ? attribute.slice(attributeSeparatorIndex + 1) : ''
    const key = rawKey.trim().toLowerCase()
    const optionValue = rawValue.trim()

    if (key === 'domain' && optionValue) {
      options.domain = optionValue
    } else if (key === 'expires' && optionValue) {
      const expires = new Date(optionValue)
      if (!Number.isNaN(expires.getTime())) {
        options.expires = expires
      }
    } else if (key === 'httponly') {
      options.httpOnly = true
    } else if (key === 'max-age' && optionValue) {
      const maxAge = Number.parseInt(optionValue, 10)
      if (!Number.isNaN(maxAge)) {
        options.maxAge = maxAge
      }
    } else if (key === 'path' && optionValue) {
      options.path = optionValue
    } else if (key === 'samesite' && optionValue) {
      const sameSite = parseSameSite(optionValue)
      if (sameSite) {
        options.sameSite = sameSite
      }
    } else if (key === 'secure') {
      options.secure = true
    }
  }

  return { name, options, value }
}

export async function applyResponseCookies(responseHeaders: Headers): Promise<void> {
  const cookieStore = await cookies()

  for (const setCookieHeader of getSetCookieHeaders(responseHeaders)) {
    const parsed = parseSetCookieHeader(setCookieHeader)
    if (parsed) {
      cookieStore.set(parsed.name, parsed.value, parsed.options)
    }
  }
}

export function applyResponseCookiesToNextResponse(responseHeaders: Headers, response: NextResponse): void {
  for (const setCookieHeader of getSetCookieHeaders(responseHeaders)) {
    response.headers.append('set-cookie', setCookieHeader)
  }
}

export function buildRequestCookieHeader(request: NextRequest): string {
  return AUTH_COOKIE_NAMES.map(cookieName => {
    const cookieValue = request.cookies.get(cookieName)?.value
    return cookieValue ? `${cookieName}=${cookieValue}` : null
  })
    .filter((value): value is string => value !== null)
    .join('; ')
}

export function clearAuthCookies(response: NextResponse): NextResponse {
  response.cookies.delete(SESSION_COOKIE_NAME)
  return response
}
