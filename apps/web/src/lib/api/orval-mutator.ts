import { apiJson } from '@/lib/api-client'
import type { APIError } from '@/lib/api/assertSuccess'

type OrvalFetchOptions = Omit<RequestInit, 'body'> & {
  baseUrl?: string
  body?: BodyInit | null
  data?: unknown
  next?:
    | {
        tags?: string[] | undefined
        revalidate?: number | false | undefined
      }
    | undefined
  params?: Record<string, unknown>
  timeoutMs?: number | false
  url?: string
}

type OrvalConfig = OrvalFetchOptions & {
  method?: string
  url: string
}

const API_PREFIX = /^\/api\/v1\/?/u

function normalizeApiPath(url: string): string {
  return url.replace(API_PREFIX, '')
}

function appendParams(url: string, params?: Record<string, unknown>): string {
  if (!params) return url

  const searchParams = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item !== undefined) searchParams.append(key, item === null ? 'null' : String(item))
      }
      continue
    }
    searchParams.append(key, value === null ? 'null' : String(value))
  }

  const queryString = searchParams.toString()
  if (!queryString) return url
  return `${url}${url.includes('?') ? '&' : '?'}${queryString}`
}

function resolveOrvalRequest(urlOrConfig: string | OrvalConfig, options?: OrvalFetchOptions) {
  if (typeof urlOrConfig === 'string') {
    return {
      path: normalizeApiPath(urlOrConfig),
      init: options ?? {},
    }
  }

  const { url, params, data, ...init } = urlOrConfig
  return {
    path: normalizeApiPath(appendParams(url, params)),
    init: {
      ...init,
      ...(data === undefined ? {} : { body: data instanceof FormData ? data : JSON.stringify(data) }),
    },
  }
}

export type ErrorType<Error> = APIError & Error
export type BodyType<BodyData> = BodyData

export async function orvalMutator<T>(urlOrConfig: string | OrvalConfig, options?: OrvalFetchOptions): Promise<T> {
  const { path, init } = resolveOrvalRequest(urlOrConfig, options)
  return apiJson<T>(path, init)
}
