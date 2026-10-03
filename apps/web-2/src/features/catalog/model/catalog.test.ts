import * as v from 'valibot'
import { describe, expect, test } from 'vite-plus/test'

import type { Capability, SessionInfo } from '#/shared/api/gen/types.gen'

import {
  coursesFilter,
  coursesSearchSchema,
  courseState,
  nextCoursesCursor,
  paletteSections,
  resolveSort,
  searchKinds,
  searchPageSchema,
  sortOptions,
} from './catalog'

const session = (capabilities: Capability[]): SessionInfo => ({
  capabilities,
  mfa_enabled: false,
  permissions: [],
  roles: [],
  user_id: 'u',
  user: {
    id: 'u',
    username: 'u',
    display_name: 'U',
    email: 'u@e.test',
    locale: 'ru-RU',
    avatar_key: null,
    theme: null,
  },
})

describe('catalog model', () => {
  test('B-CAT-04 asks for the next page with next_cursor and stops when it is null', () => {
    const cursor = '7f0c1a2e-0000-4000-8000-000000000001'
    expect(nextCoursesCursor({ items: [], next_cursor: cursor })).toBe(cursor)
    expect(nextCoursesCursor({ items: [], next_cursor: null })).toBeUndefined()
  })

  test('B-CAT-06 the sort defaults per caller, hides "in progress first" from guests, drops unknown values', () => {
    expect(v.parse(coursesSearchSchema, { sort: 'bogus', q: '  ' })).toEqual({ q: undefined, sort: undefined })
    expect(v.parse(coursesSearchSchema, { sort: 'name', q: ' rust ' })).toEqual({ q: 'rust', sort: 'name' })
    expect(sortOptions(false)).toEqual(['updated', 'name'])
    expect(sortOptions(true)).toEqual(['progress', 'updated', 'name'])
    expect(resolveSort(undefined, true)).toBe('progress')
    expect(resolveSort(undefined, false)).toBe('updated')
    expect(resolveSort('progress', false)).toBe('updated')
    expect(coursesFilter({ q: undefined, sort: 'name' }, false)).toEqual({ sort: 'name' })
    expect(coursesFilter({ q: 'go', sort: undefined }, true)).toEqual({ q: 'go', sort: 'progress' })
  })

  test('B-CAT-03 a card marks only an unpublished or an archived course', () => {
    expect(courseState({ public: true, archived_at_unix: null })).toBeNull()
    expect(courseState({ public: false, archived_at_unix: null })).toBe('unpublished')
    expect(courseState({ public: true, archived_at_unix: 1_790_000_000 })).toBe('archived')
  })

  test('B-CAT-07 an unknown or missing kind is "all"', () => {
    expect(v.parse(searchPageSchema, { q: 'go', kind: 'teachers' })).toEqual({ q: 'go', kind: undefined })
    expect(v.parse(searchPageSchema, { q: 'go', kind: 'users' })).toEqual({ q: 'go', kind: 'users' })
    expect(v.parse(searchPageSchema, {})).toEqual({ q: undefined, kind: undefined })
  })

  test('B-CAT-08 a guest gets no people section', () => {
    expect(searchKinds(false)).toEqual(['courses', 'collections'])
    expect(searchKinds(true)).toEqual(['courses', 'collections', 'users'])
  })

  test('B-CAT-11 palette navigation is the access table: only open sections, per workspace, none for a guest', () => {
    expect(paletteSections(null, '')).toEqual([])
    const student = paletteSections(session([]), '')
    expect(student.map(group => group.workspace.id)).toEqual(['learn'])
    expect(student[0]?.sections.map(section => section.to)).toContain('/courses')
    const teacher = paletteSections(session(['teach']), '')
    expect(teacher.map(group => group.workspace.id)).toEqual(['learn', 'teach'])
    // Analytics and groups need their own capability on top of `teach`.
    expect(teacher[1]?.sections.map(section => section.to)).toEqual(['/teach', '/teach/courses'])
    const filtered = paletteSections(session(['teach']), '  ' + (teacher[0]?.sections[0]?.label() ?? '').slice(0, 3))
    expect(filtered.flatMap(group => group.sections).length).toBeGreaterThan(0)
    expect(paletteSections(session([]), 'zzzz-no-such-section')).toEqual([])
  })
})
