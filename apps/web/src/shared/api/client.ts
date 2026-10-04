import { createIsomorphicFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import * as v from 'valibot'

import { serverEnv } from '#/shared/lib/env.server'

import { ApiError } from './errors'
import type { CreateClientConfig } from './gen/client.gen'
import { vProblem } from './gen/valibot.gen'
import { KEY_ORIGIN } from './key-origin'
import { noteServerDate } from './server-clock'

// The one seam between the app and the generated SDK (spec 7.4). Wired in by openapi-ts.config.ts
// `runtimeConfigPath`, so every SDK call goes through apiFetch.

const FORWARDED_HEADERS = ['accept-language', 'user-agent', 'x-forwarded-for', 'x-request-id', 'traceparent']
const SESSION_COOKIE = 'ab_session'

const apiOrigin = createIsomorphicFn()
  .server(() => serverEnv.apiOrigin)
  .client(() => new URL(document.baseURI).origin)

/** SSR only: the browser request headers the API may see. Only the session cookie is forwarded. */
const forwardedHeaders = createIsomorphicFn()
  .server(() => {
    const incoming = getRequestHeaders()
    const headers = new Headers()
    for (const name of FORWARDED_HEADERS) {
      const value = incoming.get(name)
      if (value) headers.set(name, value)
    }
    const session = incoming
      .get('cookie')
      ?.split(';')
      .map(part => part.trim())
      .find(part => part.startsWith(`${SESSION_COOKIE}=`))
    if (session) headers.set('cookie', session)
    return headers
  })
  .client(() => null)

async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const built = new Request(input, init)
  // Rebuilt with a buffered body: re-wrapping the Request would turn the body into a stream, which
  // browsers only upload over HTTP/2 (net::ERR_ALPN_NEGOTIATION_FAILED on HTTP/1.1).
  const request = new Request(built.url.replace(KEY_ORIGIN, apiOrigin()), {
    method: built.method,
    headers: built.headers,
    signal: built.signal,
    body: ['GET', 'HEAD'].includes(built.method) ? null : await built.arrayBuffer(),
  })
  const forwarded = forwardedHeaders()
  if (forwarded) {
    if (request.method !== 'GET') {
      throw new Error(`SSR only reads the API; ${request.method} ${request.url} must run in the browser (spec 7.4)`)
    }
    forwarded.forEach((value, name) => request.headers.set(name, value))
  }
  const response = await fetch(request)
  // The event stream compares event times with read times through this offset (`events.ts`).
  if (!forwarded) noteServerDate(response.headers.get('date'))
  if (!response.ok) throw await problemError(response)
  return response
}

/** Every failed response becomes an ApiError, built from the server's problem+json body. */
async function problemError(response: Response): Promise<ApiError> {
  // A proxy in front of the API can answer with HTML: such a body is not a problem, not a crash.
  const body: unknown = await response.json().catch(() => null)
  const parsed = v.safeParse(vProblem, body)
  const problem = parsed.success ? parsed.output : null
  const retryAfter = Number(response.headers.get('retry-after'))
  return new ApiError({
    status: response.status,
    code: problem?.code ?? 'internal',
    fieldErrors: problem?.field_errors ?? [],
    requestId: problem?.request_id ?? response.headers.get('x-request-id'),
    retryAfter: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null,
  })
}

export const createClientConfig: CreateClientConfig = config => ({ ...config, baseUrl: KEY_ORIGIN, fetch: apiFetch })
