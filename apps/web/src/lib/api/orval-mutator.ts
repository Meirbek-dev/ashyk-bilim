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

export type ResponseParser<T> = { parse: (data: unknown) => T } | ((data: unknown) => T)

export function stringifyQueryParam(value: unknown): string {
  return String(value)
}

function parseWith<T>(parser: ResponseParser<T>, data: unknown): T {
  return typeof parser === 'function' ? parser(data) : parser.parse(data)
}

export function arrayParser<T>(parser: ResponseParser<T>): ResponseParser<T[]> {
  return data => {
    if (!Array.isArray(data)) {
      throw new Error('Response validation failed: expected array')
    }
    return data.map(item => parseWith(parser, item))
  }
}

export function nullableParser<T>(parser: ResponseParser<T>): ResponseParser<T | null> {
  return function (data) {
    return data === null ? null : parseWith(parser, data)
  }
}

export const stringParser: ResponseParser<string> = data => {
  if (typeof data !== 'string') {
    throw new Error('Response validation failed: expected string')
  }
  return data
}

export const unknownParser: ResponseParser<unknown> = data => data

export const voidParser: ResponseParser<void> = data => {
  if (data !== undefined && data !== null && data !== '') {
    throw new Error('Response validation failed: expected empty response')
  }
  return undefined
}

export async function orvalMutator<T>(
  urlOrConfig: string | OrvalConfig,
  options: OrvalFetchOptions | undefined,
  parser: ResponseParser<T>,
): Promise<T> {
  const { path, init } = resolveOrvalRequest(urlOrConfig, options)
  return apiJson<T>(path, init, data => parseWith(parser, data))
}
