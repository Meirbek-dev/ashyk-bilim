import { HttpAgent } from '@ag-ui/client'
import type { HttpAgentFetchFn } from '@ag-ui/client'
import { fetch as transportFetch } from 'ofetch'

import { getAPIUrl } from '@services/config/config'

import { recoverBrowserSessionFrom401 } from '@/lib/api-client'

function resolveAgentUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path
  return `${getAPIUrl().replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`
}

const fetchAgent: HttpAgentFetchFn = async (url, init) => {
  let response = await transportFetch(url, { ...init, credentials: 'include' })
  if (response.status === 401 && (await recoverBrowserSessionFrom401())) {
    response = await transportFetch(url, { ...init, credentials: 'include' })
  }
  return response
}

export function createAGUIAgent(path: string): HttpAgent {
  return new HttpAgent({ fetch: fetchAgent, url: resolveAgentUrl(path) })
}
