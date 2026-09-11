import { HttpAgent } from '@ag-ui/client'
import type { HttpAgentFetchFn } from '@ag-ui/client'
import { fetch as transportFetch } from 'ofetch'

import { getAPIUrl } from '@services/config/config'

import { handleBrowserUnauthenticated } from '@/lib/api-client'
import { parseApiError } from '@/lib/api/assertSuccess'

export interface AGUIAgentOptions {
  /** Extra request headers, e.g. `Last-Event-ID` to resume a run stream. */
  headers?: Record<string, string>
  /** Called with every SSE `id:` line as it streams in (AG-UI drops them). */
  onEventId?: (id: string) => void
}

function resolveAgentUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path
  return `${getAPIUrl().replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`
}

/** Pass the bytes through untouched, reporting each complete `id:` line. */
export function observeSseEventIds(body: ReadableStream<Uint8Array>, onEventId: (id: string) => void) {
  const decoder = new TextDecoder()
  let tail = ''
  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        controller.enqueue(chunk)
        const lines = (tail + decoder.decode(chunk, { stream: true })).split(/\r?\n/)
        tail = lines.pop() ?? ''
        for (const line of lines) {
          if (line.startsWith('id:')) onEventId(line.slice(3).trim())
        }
      },
    }),
  )
}

function agentFetch(options: AGUIAgentOptions): HttpAgentFetchFn {
  return async (url, init) => {
    const response = await transportFetch(url, { ...init, credentials: 'include' })
    if (response.status === 401) {
      handleBrowserUnauthenticated()
    }
    // AG-UI only sees `HTTP <status>: <text>`; surface the problem+json code instead.
    if (!response.ok) throw await parseApiError(response, url)
    if (!options.onEventId || !response.body) return response
    return new Response(observeSseEventIds(response.body, options.onEventId), {
      headers: response.headers,
      status: response.status,
      statusText: response.statusText,
    })
  }
}

export function createAGUIAgent(path: string, options: AGUIAgentOptions = {}): HttpAgent {
  return new HttpAgent({
    fetch: agentFetch(options),
    ...(options.headers ? { headers: options.headers } : {}),
    url: resolveAgentUrl(path),
  })
}
