import { createIsomorphicFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'

import { serverEnv } from '#/shared/lib/env.server'

import { ApiError } from './errors'
import type { CreateClientConfig } from './gen/client.gen'

// The one seam between the app and the generated SDK (spec 7.4). Wired in by openapi-ts.config.ts
// `runtimeConfigPath`, so every SDK call goes through apiFetch.

const FORWARDED_HEADERS = ['accept-language', 'user-agent', 'x-forwarded-for', 'x-request-id', 'traceparent']
const SESSION_COOKIE = 'ab_session'

// The SDK builds every URL on this placeholder origin, the same in SSR and in the browser: the generated
// query keys embed the base URL, so a per-environment base would break hydration (and leak the internal
// address into the page). apiFetch swaps in the real origin: same-origin in the browser, INTERNAL_API_URL in SSR.
const KEY_ORIGIN = 'https://api.invalid'

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
  if (!response.ok) throw await ApiError.fromResponse(response)
  return response
}

export const createClientConfig: CreateClientConfig = config => ({ ...config, baseUrl: KEY_ORIGIN, fetch: apiFetch })
