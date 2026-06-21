/**
 * Unified API fetch client.
 *
 * Server-side: forwards only auth cookies from the incoming request so the
 * backend receives auth cookies automatically.
 *
 * Client-side: uses credentials:"include" so cookies are sent automatically.
 * A 401 is treated as an auth refresh opportunity first; the refresh bridge
 * will redirect to login if the refresh cookie is also invalid or missing.
 */

import { getAPIUrl, getServerAPIUrl } from '@services/config/config'
import { buildLoginRedirect, isAuthRoute } from '@/lib/auth/redirect'
import { AUTH_COOKIE_NAMES } from '@/lib/auth/types'
import { clientApiError, parseApiError } from '@/lib/api/assertSuccess'

type ApiFetchInit = Omit<RequestInit, 'credentials'> & {
  /** Override which base URL to use (defaults to environment-aware selection). */
  baseUrl?: string
  /** Override the default request timeout. Use false for no client-side timeout. */
  timeoutMs?: number | false
  next?:
    | {
        tags?: string[] | undefined
        revalidate?: number | false | undefined
      }
    | undefined
}

function apiBase(isServer: boolean, baseUrl?: string): string {
  if (baseUrl) return baseUrl
  return isServer ? getServerAPIUrl() : getAPIUrl()
}

function resolveRequestUrl(pathOrUrl: string, base: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) {
    return pathOrUrl
  }

  return `${base.replace(/\/+$/, '')}/${pathOrUrl.replace(/^\/+/, '')}`
}

function isRequestCookieUnavailableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const message = error.message.toLowerCase()
  return (
    message.includes('during prerendering') ||
    message.includes('prerender is complete') ||
    message.includes('outside a request scope') ||
    message.includes('requestasyncstorage')
  )
}

async function getServerCookieHeader(): Promise<string> {
  try {
    const { cookies } = await import('next/headers')
    const cookieStore = await cookies()

    return cookieStore
      .getAll()
      .filter(c => (AUTH_COOKIE_NAMES as readonly string[]).includes(c.name))
      .map(c => `${c.name}=${c.value}`)
      .join('; ')
  } catch (error) {
    if (isRequestCookieUnavailableError(error)) return ''
    throw error
  }
}

const DEFAULT_TIMEOUT_MS = 30_000 // 30 seconds

/** Prevents multiple concurrent 401 responses from racing to redirect. */
let authRedirectPending = false
let authRefreshPromise: Promise<boolean> | null = null

function createTimeoutReason(timeoutMs: number): Error {
  const error = new Error(`Request timed out after ${Math.round(timeoutMs / 1000)} seconds`)
  error.name = 'TimeoutError'
  return error
}

function createFrontendRequestId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID()
  }
  return `web_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')
}

function isTimeoutError(error: unknown): boolean {
  return error instanceof Error && error.name === 'TimeoutError'
}

function combineAbortSignals(signals: AbortSignal[]): {
  signal: AbortSignal
  cleanup: () => void
} {
  const activeSignals = signals.filter(Boolean)

  if (activeSignals.length === 1) {
    return { signal: activeSignals[0]!, cleanup: () => undefined }
  }

  const controller = new AbortController()
  const listeners: { signal: AbortSignal; listener: () => void }[] = []

  const abortFrom = (signal: AbortSignal) => {
    if (!controller.signal.aborted) {
      controller.abort(signal.reason ?? new Error('Request aborted'))
    }
  }

  for (const signal of activeSignals) {
    if (signal.aborted) {
      abortFrom(signal)
      continue
    }

    const listener = () => abortFrom(signal)
    signal.addEventListener('abort', listener, { once: true })
    listeners.push({ signal, listener })
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      for (const { signal, listener } of listeners) {
        signal.removeEventListener('abort', listener)
      }
    },
  }
}

export function getBrowserReturnTo(): string {
  const { pathname, search } = globalThis.location
  return `${pathname}${search}` || '/'
}

export async function refreshBrowserSession(returnTo: string): Promise<boolean> {
  authRefreshPromise ??= fetch(`/api/auth/refresh?returnTo=${encodeURIComponent(returnTo)}`, {
    method: 'GET',
    headers: {
      accept: 'application/json',
      'x-auth-refresh': 'fetch',
    },
    credentials: 'include',
    cache: 'no-store',
    redirect: 'manual',
  })
    .then(response => response.ok)
    .catch(() => false)
    .finally(() => {
      authRefreshPromise = null
    })

  return authRefreshPromise
}

export function redirectBrowserToLogin(returnTo: string): void {
  if (authRedirectPending) return
  authRedirectPending = true
  globalThis.location.assign(buildLoginRedirect(returnTo))
}

export async function recoverBrowserSessionFrom401(returnTo = getBrowserReturnTo()): Promise<boolean> {
  if (typeof globalThis.window === 'undefined' || isAuthRoute(globalThis.location.pathname)) {
    return false
  }

  const refreshed = await refreshBrowserSession(returnTo)
  if (!refreshed) {
    redirectBrowserToLogin(returnTo)
  }

  return refreshed
}

export async function apiFetch(path: string, init: ApiFetchInit = {}): Promise<Response> {
  const isServer = typeof globalThis.window === 'undefined'
  const { baseUrl, timeoutMs = DEFAULT_TIMEOUT_MS, signal: callerSignal, ...fetchInit } = init
  const base = apiBase(isServer, baseUrl)
  const url = resolveRequestUrl(path, base)

  // When cache tags are provided (server-side Next.js Data Cache), opt-in to
  // force-cache so revalidateTag() actually works. Without this the default
  // 'no-store' would silently override the tags and disable caching entirely.
  const hasCacheTags = isServer && Array.isArray(fetchInit.next?.tags) && fetchInit.next.tags.length > 0
  const defaultCache: RequestCache = hasCacheTags ? 'force-cache' : 'no-store'
  const options: RequestInit = {
    ...fetchInit,
    credentials: 'include',
    cache: fetchInit.cache ?? defaultCache,
  }

  const normalizedHeaders = new Headers(options.headers ?? {})
  if (!normalizedHeaders.has('X-Request-ID')) {
    normalizedHeaders.set('X-Request-ID', createFrontendRequestId())
  }
  options.headers = Object.fromEntries(normalizedHeaders.entries())

  // Server: forward cookies from the incoming request.
  if (isServer) {
    const existingHeaders = new Headers(options.headers ?? {})
    if (!existingHeaders.has('Cookie')) {
      const serverCookieHeader = await getServerCookieHeader()
      if (serverCookieHeader) {
        options.headers = {
          ...Object.fromEntries(existingHeaders.entries()),
          Cookie: serverCookieHeader,
        }
      }
    }
  }

  const effectiveTimeoutMs = typeof timeoutMs === 'number' ? timeoutMs : null
  const timeoutController = effectiveTimeoutMs === null ? null : new AbortController()
  let timeoutId: ReturnType<typeof setTimeout> | null = null

  if (timeoutController && effectiveTimeoutMs !== null && effectiveTimeoutMs > 0) {
    timeoutId = setTimeout(() => timeoutController.abort(createTimeoutReason(effectiveTimeoutMs)), effectiveTimeoutMs)
  }

  const abortSignals = [callerSignal, timeoutController?.signal].filter((signal): signal is AbortSignal =>
    Boolean(signal),
  )
  const combinedSignal = abortSignals.length > 0 ? combineAbortSignals(abortSignals) : null

  try {
    let response: Response
    try {
      response = await fetch(url, {
        ...options,
        ...(combinedSignal ? { signal: combinedSignal.signal } : {}),
      })
    } catch (error) {
      const abortedReason = combinedSignal?.signal.aborted ? combinedSignal.signal.reason : undefined
      const cause = abortedReason ?? error
      if (isTimeoutError(cause)) {
        throw clientApiError('CLIENT_TIMEOUT', cause.message, {
          cause,
          path: url,
          requestId: normalizedHeaders.get('X-Request-ID'),
        })
      }
      if (isAbortError(error) || combinedSignal?.signal.aborted) {
        throw clientApiError('REQUEST_ABORTED', 'Request was aborted', {
          cause,
          path: url,
          requestId: normalizedHeaders.get('X-Request-ID'),
        })
      }
      throw clientApiError('NETWORK_UNAVAILABLE', 'Network request failed', {
        cause: error,
        path: url,
        requestId: normalizedHeaders.get('X-Request-ID'),
      })
    }

    if (!isServer && response.status === 401) {
      const refreshed = await recoverBrowserSessionFrom401()
      if (refreshed) {
        return fetch(url, {
          ...options,
          ...(combinedSignal ? { signal: combinedSignal.signal } : {}),
        })
      }
    }

    return response
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
    combinedSignal?.cleanup()
  }
}

export const apiFetcher = async <T = unknown>(url: string): Promise<T> => {
  const response = await apiFetch(url, { method: 'GET' })
  return errorHandling<T>(response)
}

export async function apiJson<T = unknown>(path: string, init: ApiFetchInit = {}): Promise<T> {
  const response = await apiFetch(path, init)
  if (!response.ok) {
    throw await parseApiError(response, path)
  }
  if (response.status === 204) {
    return undefined as T
  }
  return (await response.json()) as T
}

export async function apiResult<T = unknown>(
  path: string,
  init: ApiFetchInit = {},
  parse?: (data: unknown) => T,
): Promise<{ data: T; headers: Record<string, string>; requestId: string | null }> {
  const response = await apiFetch(path, init)
  if (!response.ok) {
    throw await parseApiError(response, path)
  }
  const rawData = response.status === 204 ? undefined : await response.json()
  const data = parse ? parse(rawData) : (rawData as T)
  const headers: Record<string, string> = {}
  for (const [key, value] of response.headers.entries()) {
    headers[key.toLowerCase()] = value
  }
  return {
    data,
    headers,
    requestId: response.headers.get('x-request-id'),
  }
}

export async function apiStreamFetch(path: string, init: ApiFetchInit = {}): Promise<Response> {
  return apiFetch(path, {
    ...init,
    cache: init.cache ?? 'no-store',
    timeoutMs: init.timeoutMs ?? false,
  })
}

export const fetchResponseMetadata = async <T = unknown>(url: string): Promise<CustomResponseTyping<T>> => {
  const response = await apiFetch(url, {
    method: 'GET',
  })
  return getResponseMetadata<T>(response)
}

export const apiFetcherWithHeaders = async (
  url: string,
): Promise<{ data: unknown; headers: Record<string, string> }> => {
  const response = await apiFetch(url, {
    method: 'GET',
  })
  if (!response.ok) {
    throw await parseApiError(response, url)
  }
  const data = (await response.json()) as unknown
  const resHeaders: Record<string, string> = {}
  for (const [key, value] of response.headers.entries()) {
    resHeaders[key.toLowerCase()] = value
  }
  return { data, headers: resHeaders }
}

export async function errorHandling<T = unknown>(res: Response): Promise<T> {
  if (!res.ok) {
    throw await parseApiError(res)
  }
  return res.json() as Promise<T>
}

export interface CustomResponseTyping<T = unknown> {
  success: boolean
  data: T
  status: number
  HTTPmessage: string
}

export const getResponseMetadata = async <T = unknown>(response: Response): Promise<CustomResponseTyping<T>> => {
  let data: unknown = null
  try {
    data = await response.json()
  } catch (error) {
    console.warn('Failed to parse response JSON in getResponseMetadata', {
      status: response.status,
      statusText: response.statusText,
      error,
    })
  }

  return {
    success: response.ok,
    data: data as T,
    status: response.status,
    HTTPmessage: response.statusText,
  }
}
