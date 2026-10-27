import * as v from 'valibot'
import { describe, expect, test } from 'vite-plus/test'

import type { Course } from '#/shared/api/gen/types.gen'

import { collectionsSearchSchema } from '../route'
import { hiddenFromOthers } from './collections'

const course = (open: boolean, archived = false): Pick<Course, 'public' | 'archived_at_unix'> => ({
  public: open,
  archived_at_unix: archived ? 1 : null,
})

describe('collection visibility', () => {
  test('B-COL-16 a public collection of closed courses is hidden from others; empty or private ones are not flagged', () => {
    expect(hiddenFromOthers({ public: true, courses: [course(false), course(true, true)] })).toBe(true)
    expect(hiddenFromOthers({ public: true, courses: [course(false), course(true)] })).toBe(false)
    expect(hiddenFromOthers({ public: true, courses: [] })).toBe(false)
    expect(hiddenFromOthers({ public: false, courses: [course(false)] })).toBe(false)
  })
})

test('B-COL-18 a NUL in ?q= is dropped (the search API refuses it); blank is no search', () => {
  expect(v.parse(collectionsSearchSchema, { q: 'sq\0l' })).toEqual({ q: 'sql', create: undefined })
  expect(v.parse(collectionsSearchSchema, { q: ' \0 ' })).toEqual({ q: undefined, create: undefined })
})
