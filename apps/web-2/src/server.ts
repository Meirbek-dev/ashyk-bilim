import handler from '@tanstack/react-start/server-entry'

import { paraglideMiddleware } from '#/paraglide/server'
import { NONCE_HEADER, contentSecurityPolicy } from '#/shared/lib/csp'
import { serverEnv } from '#/shared/lib/env.server'
import { SSR_STATUS_HEADER } from '#/shared/lib/ssr-status'

// The web server's request chain (spec 7.4): /healthz, /_client-error, then locale, request id,
// CSP nonce and the Start handler. Static files never get here: serve.ts answers them first.

const REQUEST_ID = /^[\w-]{1,64}$/
const CLIENT_ERROR_MAX_BYTES = 8 * 1024
const CLIENT_ERROR_PER_MINUTE = 10
// ponytail: in-process counter, per instance; move to the edge if the web ever runs replicated.
const clientErrorBudget = new Map<string, { windowStart: number; count: number }>()

const log = (entry: Record<string, unknown>) => process.stdout.write(`${JSON.stringify(entry)}\n`)

// serverEnv is parsed on import: a missing or malformed variable has already stopped the process here.
log({ level: 'info', msg: 'web server ready', public_origin: serverEnv.publicOrigin, api: serverEnv.apiOrigin })

function overBudget(client: string, now: number): boolean {
  if (clientErrorBudget.size > 10_000) clientErrorBudget.clear()
  const entry = clientErrorBudget.get(client)
  if (!entry || now - entry.windowStart > 60_000) {
    clientErrorBudget.set(client, { windowStart: now, count: 1 })
    return false
  }
  entry.count += 1
  return entry.count > CLIENT_ERROR_PER_MINUTE
}

async function clientError(request: Request, requestId: string): Promise<Response> {
  const client = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'direct'
  if (overBudget(client, Date.now())) return new Response(null, { status: 429 })
  if (Number(request.headers.get('content-length') ?? 0) > CLIENT_ERROR_MAX_BYTES)
    return new Response(null, { status: 413 })
  const body = await request.text()
  if (body.length > CLIENT_ERROR_MAX_BYTES) return new Response(null, { status: 413 })
  try {
    log({ level: 'error', source: 'browser', request_id: requestId, report: JSON.parse(body) })
  } catch {
    return new Response(null, { status: 400 })
  }
  return new Response(null, { status: 204 })
}

async function render(request: Request, requestId: string): Promise<Response> {
  const nonce = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64')
  const headers = new Headers(request.headers)
  headers.set('x-request-id', requestId)
  headers.set(NONCE_HEADER, nonce)
  // A fresh Request: srvx hands over a lightweight Node request that undici cannot clone.
  const forwarded = new Request(request.url, { method: request.method, headers, signal: request.signal })
  const rendered = await paraglideMiddleware(forwarded, ({ request: localized }) => handler.fetch(localized))
  // A route error renders as 500; an ApiError thrown during SSR asked for its own status (shared/lib/ssr-status.ts).
  const status = Number(rendered.headers.get(SSR_STATUS_HEADER))
  const response = new Response(rendered.body, status >= 400 ? { status, headers: rendered.headers } : rendered)
  response.headers.delete(SSR_STATUS_HEADER)
  if (response.headers.get('content-type')?.startsWith('text/html')) {
    response.headers.set('cache-control', 'private, no-store')
    if (!import.meta.env.DEV) response.headers.set('content-security-policy', contentSecurityPolicy(nonce))
  }
  return response
}

export default {
  async fetch(request: Request): Promise<Response> {
    const started = performance.now()
    const { pathname } = new URL(request.url)
    if (pathname === '/healthz') return new Response('ok', { headers: { 'cache-control': 'no-store' } })

    const incomingId = request.headers.get('x-request-id')
    const requestId = incomingId && REQUEST_ID.test(incomingId) ? incomingId : crypto.randomUUID()
    const response =
      pathname === '/_client-error' && request.method === 'POST'
        ? await clientError(request, requestId)
        : // The web serves documents only: no server functions, no data endpoints (spec 7.4).
          ['GET', 'HEAD'].includes(request.method)
          ? await render(request, requestId)
          : new Response(null, { status: 405, headers: { allow: 'GET, HEAD' } })
    response.headers.set('x-request-id', requestId)
    log({
      level: 'info',
      request_id: requestId,
      method: request.method,
      path: pathname,
      status: response.status,
      ms: Math.round(performance.now() - started),
    })
    return response
  },
}
