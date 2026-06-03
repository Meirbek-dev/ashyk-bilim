import type { ComponentType } from 'react'

export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }
export type JsonObject = Record<string, JsonValue>
export type UnknownRecord = Record<string, unknown>

export type TranslationValues = Record<string, string | number | Date>
export type TranslationFunction = (key: string, values?: TranslationValues) => string

export type IconComponent = ComponentType<
  {
    className?: string
    size?: number | string
    strokeWidth?: number | string
    [key: string]: unknown
  }
>

export interface ApiErrorLike extends Error {
  code?: string
  data?: unknown
  detail?: unknown
  payload?: unknown
  requestId?: string | null
  status?: number
  statusCode?: number
}

export function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null
}

export function getErrorMessage(error: unknown, fallback = 'Request failed'): string {
  if (error instanceof Error && error.message) return error.message
  if (isRecord(error) && typeof error.message === 'string') return error.message
  return fallback
}

export function getErrorStatus(error: unknown, fallback = 500): number {
  if (isRecord(error)) {
    const rawStatus = error.status ?? error.statusCode
    if (typeof rawStatus === 'number' && Number.isFinite(rawStatus)) return rawStatus
  }
  return fallback
}
