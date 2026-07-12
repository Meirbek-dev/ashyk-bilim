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
import { fetch as transportFetch, ofetch } from 'ofetch'
import type { FetchOptions, FetchResponse, MappedResponseType, ResponseType } from 'ofetch'
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
const RETRY_STATUS_CODES = [408, 425, 429, 500, 502, 503, 504]
const RETRYABLE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/** Prevents multiple concurrent 401 responses from racing to redirect. */
let authRedirectPending = false
let authRefreshPromise: Promise<boolean> | null = null

let serverRequestCounter = 0
const serverProcessId = typeof globalThis.window === 'undefined' ? Math.random().toString(36).slice(2) : ''
let serverTraceCounter = 0
const serverTracePrefix =
  typeof globalThis.window === 'undefined'
    ? Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)
        .toString(16)
        .padStart(16, '0')
        .slice(0, 16)
    : ''

function createFrontendRequestId(): string {
  if (typeof globalThis.window !== 'undefined' && typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID()
  }
  // Server-side: use a process-level prefix and an incrementing counter to avoid
  // calling dynamic APIs (Date.now(), Math.random(), etc.) during render. This
  // prevents Next.js prerender warnings and keeps static routes cacheable.
  serverRequestCounter += 1
  return `web_${serverProcessId}_${serverRequestCounter}`
}

function randomHex(byteCount: number): string | null {
  if (typeof globalThis.crypto?.getRandomValues !== 'function') return null

  const bytes = new Uint8Array(byteCount)
  globalThis.crypto.getRandomValues(bytes)
  return [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

function createTraceparent(): string {
  const randomTraceId = randomHex(16)
  const randomSpanId = randomHex(8)

  if (randomTraceId && randomSpanId) {
    return `00-${randomTraceId}-${randomSpanId}-01`
  }

  serverTraceCounter += 1
  const counter = serverTraceCounter.toString(16).padStart(16, '0')
  return `00-${serverTracePrefix}${counter}-${counter.slice(-16)}-01`
}

function getErrorCause(error: unknown): unknown {
  return error instanceof Error && 'cause' in error ? error.cause : undefined
}

function isAbortError(error: unknown): boolean {
  const cause = getErrorCause(error)
  return error instanceof Error && (error.name === 'AbortError' || isAbortError(cause))
}

function isTimeoutError(error: unknown): boolean {
  const cause = getErrorCause(error)
  return (
    error instanceof Error &&
    (error.name === 'TimeoutError' || error.message.toLowerCase().includes('timeout') || isTimeoutError(cause))
  )
}

function combineAbortSignals(signals: (AbortSignal | undefined | null)[]): {
  signal: AbortSignal
  cleanup: () => void
} {
  const activeSignals = signals.filter((s): s is AbortSignal => Boolean(s))

  if (activeSignals.length === 0) {
    const controller = new AbortController()
    return { signal: controller.signal, cleanup: () => undefined }
  }

  if (activeSignals.length === 1) {
    return { signal: activeSignals[0]!, cleanup: () => undefined }
  }

  if (typeof AbortSignal.any === 'function') {
    return { signal: AbortSignal.any(activeSignals), cleanup: () => undefined }
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

function createTimeoutSignal(timeoutMs: number): { signal: AbortSignal; cleanup: () => void } {
  if (typeof AbortSignal.timeout === 'function') {
    return { signal: AbortSignal.timeout(timeoutMs), cleanup: () => undefined }
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => {
    const error = new Error(`Request timed out after ${Math.round(timeoutMs / 1000)} seconds`)
    error.name = 'TimeoutError'
    controller.abort(error)
  }, timeoutMs)

  return {
    signal: controller.signal,
    cleanup: () => clearTimeout(timeoutId),
  }
}

function getFetchErrorResponse(error: unknown): FetchResponse<unknown> | null {
  const response = error && typeof error === 'object' ? (error as { response?: unknown }).response : null
  return response instanceof Response ? response : null
}

function getHeaderValue(headers: HeadersInit | undefined, name: string): string | null {
  return new Headers(headers).get(name)
}

function isRetryableMethod(method: string | undefined): boolean {
  return RETRYABLE_METHODS.has((method ?? 'GET').toUpperCase())
}

function retryDelay(): number {
  return 100 + Math.floor(Math.random() * 100)
}

const apiTransport = ofetch.create({
  retryStatusCodes: RETRY_STATUS_CODES,
  async onRequest({ options }) {
    const isServer = typeof globalThis.window === 'undefined'
    const headers = new Headers(options.headers)

    if (!headers.has('traceparent')) {
      headers.set('traceparent', createTraceparent())
    }
    if (!headers.has('X-Request-ID')) {
      headers.set('X-Request-ID', createFrontendRequestId())
    }

    if (isServer && !headers.has('Cookie')) {
      const serverCookieHeader = await getServerCookieHeader()
      if (serverCookieHeader) headers.set('Cookie', serverCookieHeader)
    }

    options.credentials = 'include'
    options.headers = headers
  },
})

export function getBrowserReturnTo(): string {
  const { pathname, search } = globalThis.location
  return `${pathname}${search}` || '/'
}

export async function refreshBrowserSession(returnTo: string): Promise<boolean> {
  authRefreshPromise ??= transportFetch(`/api/auth/refresh?returnTo=${encodeURIComponent(returnTo)}`, {
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

type ApiTransportOptions<R extends ResponseType = 'json'> = FetchOptions<R> & {
  next?: ApiFetchInit['next']
}

function buildApiTransportOptions<R extends ResponseType>(
  init: ApiFetchInit,
  responseType: R,
): {
  baseURL: string
  cleanup: () => void
  options: ApiTransportOptions<R>
  timeoutMs: number | null
} {
  const isServer = typeof globalThis.window === 'undefined'
  const { baseUrl, timeoutMs = DEFAULT_TIMEOUT_MS, signal: callerSignal, ...fetchInit } = init

  // When cache tags are provided (server-side Next.js Data Cache), opt-in to
  // force-cache so revalidateTag() actually works. Without this the default
  // 'no-store' would silently override the tags and disable caching entirely.
  const hasCacheTags = isServer && Array.isArray(fetchInit.next?.tags) && fetchInit.next.tags.length > 0
  const defaultCache: RequestCache = hasCacheTags ? 'force-cache' : 'no-store'
  const effectiveTimeoutMs = typeof timeoutMs === 'number' && timeoutMs > 0 ? timeoutMs : null
  const timeoutSignal = callerSignal && effectiveTimeoutMs ? createTimeoutSignal(effectiveTimeoutMs) : null
  const combinedSignal = timeoutSignal ? combineAbortSignals([callerSignal, timeoutSignal.signal]) : null
  const method = fetchInit.method
  const headers = new Headers(fetchInit.headers)

  if (!headers.has('traceparent')) {
    headers.set('traceparent', createTraceparent())
  }
  if (!headers.has('X-Request-ID')) {
    headers.set('X-Request-ID', createFrontendRequestId())
  }

  const options: ApiTransportOptions<R> = {
    ...fetchInit,
    baseURL: apiBase(isServer, baseUrl),
    credentials: 'include',
    cache: fetchInit.cache ?? defaultCache,
    headers,
    ignoreResponseError: false,
    responseType,
    retry: isRetryableMethod(method) ? 1 : 0,
    retryDelay,
    retryStatusCodes: RETRY_STATUS_CODES,
    ...(combinedSignal ? { signal: combinedSignal.signal } : callerSignal ? { signal: callerSignal } : {}),
    ...(!callerSignal && effectiveTimeoutMs ? { timeout: effectiveTimeoutMs } : {}),
  }

  return {
    baseURL: options.baseURL ?? '',
    cleanup: () => {
      combinedSignal?.cleanup()
      timeoutSignal?.cleanup()
    },
    options,
    timeoutMs: effectiveTimeoutMs,
  }
}

function toClientRequestError(
  error: unknown,
  path: string,
  baseURL: string,
  options: { headers?: HeadersInit | undefined; signal?: AbortSignal | null | undefined },
  timeoutMs: number | null,
): Error {
  const requestId = getHeaderValue(options.headers, 'X-Request-ID')
  const url = resolveRequestUrl(path, baseURL)

  if (isTimeoutError(error) || (timeoutMs !== null && !options.signal && isAbortError(error))) {
    const timeoutSeconds = Math.round((timeoutMs ?? DEFAULT_TIMEOUT_MS) / 1000)
    return clientApiError('CLIENT_TIMEOUT', `Request timed out after ${timeoutSeconds} seconds`, {
      cause: error,
      path: url,
      requestId,
    })
  }

  if (isAbortError(error) || options.signal?.aborted) {
    return clientApiError('REQUEST_ABORTED', 'Request was aborted', {
      cause: options.signal?.reason ?? error,
      path: url,
      requestId,
    })
  }

  return clientApiError('NETWORK_UNAVAILABLE', 'Network request failed', {
    cause: error,
    path: url,
    requestId,
  })
}

async function rawTransportFetch(path: string, init: ApiFetchInit = {}): Promise<Response> {
  const { baseURL, cleanup, options, timeoutMs } = buildApiTransportOptions(init, 'stream')

  try {
    return await apiTransport.raw<ReadableStream<Uint8Array>, 'stream'>(path, options)
  } catch (error) {
    const response = getFetchErrorResponse(error)
    if (response) return response
    throw toClientRequestError(error, path, baseURL, options, timeoutMs)
  } finally {
    cleanup()
  }
}

async function apiFetchRaw(path: string, init: ApiFetchInit = {}): Promise<Response> {
  const isServer = typeof globalThis.window === 'undefined'

  let response = await rawTransportFetch(path, init)

  if (!isServer && response.status === 401) {
    const refreshed = await recoverBrowserSessionFrom401()
    if (refreshed) {
      response = await rawTransportFetch(path, init)
    }
  }

  return response
}

export async function apiBody<T = unknown, R extends ResponseType = 'json'>(
  path: string,
  init: ApiFetchInit & { responseType?: R } = {},
): Promise<MappedResponseType<R, T>> {
  const { responseType = 'json' as R, ...requestInit } = init
  const response = await apiFetchRaw(path, requestInit)

  if (!response.ok) {
    throw await parseApiError(response, path)
  }

  if (response.status === 204) {
    return undefined as MappedResponseType<R, T>
  }

  if (responseType === 'stream') {
    return response.body as MappedResponseType<R, T>
  }
  if (responseType === 'blob') {
    return (await response.blob()) as MappedResponseType<R, T>
  }
  if (responseType === 'arrayBuffer') {
    return (await response.arrayBuffer()) as MappedResponseType<R, T>
  }
  if (responseType === 'text') {
    return (await response.text()) as MappedResponseType<R, T>
  }

  return (await response.json()) as MappedResponseType<R, T>
}

export async function apiJson<T = unknown>(
  path: string,
  init: ApiFetchInit = {},
  parse?: (data: unknown) => T,
): Promise<T> {
  const data = await apiBody(path, init)
  return parse ? parse(data) : (data as T)
}

export async function apiResult<T = unknown>(
  path: string,
  init: ApiFetchInit = {},
  parse?: (data: unknown) => T,
): Promise<{ data: T; headers: Record<string, string>; requestId: string | null; status: number; statusText: string }> {
  const response = await apiFetchRaw(path, init)
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
    status: response.status,
    statusText: response.statusText,
  }
}
