import { describe, expect, test } from 'vite-plus/test'

import { ApiError } from '#/shared/api/errors'

import { nextSort } from './data-columns'
import { listStatus } from './list-status'

const apiError = (status: number) =>
  new ApiError({
    status,
    code: status === 403 ? 'forbidden' : 'internal',
    fieldErrors: [],
    requestId: null,
    retryAfter: null,
  })

describe('listStatus', () => {
  test('rows on screen win over a background refetch or its error', () => {
    expect(listStatus({ pending: true, error: apiError(500), count: 3, filtered: false })).toBe('ready')
  })

  test('a 403 is "no access", any other error is "error"', () => {
    expect(listStatus({ pending: false, error: apiError(403), count: 0, filtered: false })).toBe('forbidden')
    expect(listStatus({ pending: false, error: apiError(500), count: 0, filtered: true })).toBe('error')
    expect(listStatus({ pending: false, error: new TypeError('offline'), count: 0, filtered: false })).toBe('error')
  })

  test('no rows: loading, then "no matches" with a filter in the URL, else "empty"', () => {
    expect(listStatus({ pending: true, error: null, count: 0, filtered: true })).toBe('loading')
    expect(listStatus({ pending: false, error: null, count: 0, filtered: true })).toBe('no-matches')
    expect(listStatus({ pending: false, error: null, count: 0, filtered: false })).toBe('empty')
  })
})

describe('nextSort', () => {
  test('a header cycles ascending, descending, default; another header starts ascending', () => {
    expect(nextSort(undefined, 'name')).toEqual({ id: 'name', desc: false })
    expect(nextSort({ id: 'name', desc: false }, 'name')).toEqual({ id: 'name', desc: true })
    expect(nextSort({ id: 'name', desc: true }, 'name')).toBeUndefined()
    expect(nextSort({ id: 'name', desc: true }, 'date')).toEqual({ id: 'date', desc: false })
  })
})
