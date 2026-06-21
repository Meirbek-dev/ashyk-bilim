import 'server-only'

import { cookies, headers } from 'next/headers'
import type { NextRequest, NextResponse } from 'next/server'
import { getServerAPIUrl } from '@services/config/config'
import { applyResponseCookies, applyResponseCookiesToNextResponse } from './cookie-bridge'
import { AUTH_COOKIE_NAMES } from './types'

type HeaderSource = Pick<Headers, 'get'>

interface ServerAuthFetchInit extends Omit<RequestInit, 'credentials'> {
  includeAuthCookies?: boolean
}

function resolveBackendUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path
  return `${getServerAPIUrl().replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`
}

function appendIfPresent(targetHeaders: Headers, key: string, value: string | null): void {
  if (value) {
    targetHeaders.set(key, value)
  }
}

export function buildForwardedRequestMetadataHeaders(sourceHeaders: HeaderSource): Headers {
  const forwardedHeaders = new Headers()

  appendIfPresent(forwardedHeaders, 'user-agent', sourceHeaders.get('user-agent'))
  appendIfPresent(forwardedHeaders, 'x-forwarded-for', sourceHeaders.get('x-forwarded-for'))
  appendIfPresent(
    forwardedHeaders,
    'x-forwarded-host',
    sourceHeaders.get('x-forwarded-host') ?? sourceHeaders.get('host'),
  )
  appendIfPresent(forwardedHeaders, 'x-forwarded-proto', sourceHeaders.get('x-forwarded-proto'))

  return forwardedHeaders
}

export const buildTrustedForwardedHeaders = buildForwardedRequestMetadataHeaders

export async function getServerAuthCookieHeader(): Promise<string> {
  const cookieStore = await cookies()
  return AUTH_COOKIE_NAMES.map(cookieName => {
    const cookieValue = cookieStore.get(cookieName)?.value
    return cookieValue ? `${cookieName}=${cookieValue}` : null
  })
    .filter((value): value is string => value !== null)
    .join('; ')
}

export function getRequestAuthCookieHeader(request: NextRequest): string {
  return AUTH_COOKIE_NAMES.map(cookieName => {
    const cookieValue = request.cookies.get(cookieName)?.value
    return cookieValue ? `${cookieName}=${cookieValue}` : null
  })
    .filter((value): value is string => value !== null)
    .join('; ')
}

export async function serverAuthFetch(path: string, init: ServerAuthFetchInit = {}): Promise<Response> {
  const { includeAuthCookies, ...fetchInit } = init
  const requestHeaders = await headers()
  const forwardedHeaders = buildForwardedRequestMetadataHeaders(requestHeaders)
  const providedHeaders = new Headers(fetchInit.headers)

  providedHeaders.forEach((value, key) => {
    forwardedHeaders.set(key, value)
  })

  if (includeAuthCookies !== false && !forwardedHeaders.has('cookie')) {
    const cookieHeader = await getServerAuthCookieHeader()
    if (cookieHeader) {
      forwardedHeaders.set('cookie', cookieHeader)
    }
  }

  return fetch(resolveBackendUrl(path), {
    ...fetchInit,
    headers: forwardedHeaders,
    cache: fetchInit.cache ?? 'no-store',
    redirect: fetchInit.redirect ?? 'manual',
  })
}

export function serverAuthFetchForRequest(
  request: NextRequest,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const forwardedHeaders = buildForwardedRequestMetadataHeaders(request.headers)
  const providedHeaders = new Headers(init.headers)

  providedHeaders.forEach((value, key) => {
    forwardedHeaders.set(key, value)
  })

  if (!forwardedHeaders.has('cookie')) {
    const cookieHeader = getRequestAuthCookieHeader(request)
    if (cookieHeader) {
      forwardedHeaders.set('cookie', cookieHeader)
    }
  }

  return fetch(resolveBackendUrl(path), {
    ...init,
    headers: forwardedHeaders,
    cache: init.cache ?? 'no-store',
    redirect: init.redirect ?? 'manual',
  })
}

export function postAuthJson(path: string, body: unknown, init: ServerAuthFetchInit = {}): Promise<Response> {
  const jsonHeaders = new Headers(init.headers)
  jsonHeaders.set('content-type', 'application/json')

  return serverAuthFetch(path, {
    ...init,
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify(body),
  })
}

export function postAuthForm(path: string, body: URLSearchParams, init: ServerAuthFetchInit = {}): Promise<Response> {
  const formHeaders = new Headers(init.headers)
  formHeaders.set('content-type', 'application/x-www-form-urlencoded')

  return serverAuthFetch(path, {
    ...init,
    method: 'POST',
    headers: formHeaders,
    body,
  })
}

export async function applyBackendSetCookies(responseHeaders: Headers): Promise<void> {
  await applyResponseCookies(responseHeaders)
}

export function copyBackendSetCookies(responseHeaders: Headers, response: NextResponse): void {
  applyResponseCookiesToNextResponse(responseHeaders, response)
}
