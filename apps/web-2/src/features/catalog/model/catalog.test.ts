import * as v from 'valibot'
import { describe, expect, test } from 'vite-plus/test'

import { m } from '#/paraglide/messages'
import type { Capability, SessionInfo } from '#/shared/api/gen/types.gen'

import {
  authorNames,
  coursesFilter,
  courseState,
  landingLead,
  localizedPlatform,
  mergeSearchPages,
  nextCoursesCursor,
  paletteCourseTarget,
  paletteSections,
  paletteSettings,
  resolveSort,
  searchCount,
  searchKinds,
  sortOptions,
} from './catalog'
import { coursesSearchSchema, searchPageSchema } from '../route'

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
    language: 'ru',
    email_verified: true,
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

  test('B-CAT-15 the author line keeps the server order and falls back to the username', () => {
    expect(
      authorNames([
        { display_name: 'Анна Ли', username: 'anna' },
        { display_name: ' ', username: 'bob' },
      ]),
    ).toBe('Анна Ли, bob')
    expect(authorNames([])).toBe('')
  })

  test('B-CAT-07 an unknown or missing kind is "all"', () => {
    expect(v.parse(searchPageSchema, { q: 'go', kind: 'teachers' })).toEqual({ q: 'go', kind: undefined })
    expect(v.parse(searchPageSchema, { q: 'go', kind: 'users' })).toEqual({ q: 'go', kind: 'users' })
    expect(v.parse(searchPageSchema, {})).toEqual({ q: undefined, kind: undefined })
    expect(v.parse(searchPageSchema, { q: 'py\0thon' })).toEqual({ q: 'python', kind: undefined })
    expect(v.parse(coursesSearchSchema, { q: '\0' })).toEqual({ q: undefined, sort: undefined })
  })

  test('B-CAT-08 a guest gets no people section', () => {
    expect(searchKinds(false)).toEqual(['courses', 'lessons', 'collections'])
    expect(searchKinds(true)).toEqual(['courses', 'lessons', 'collections', 'users'])
  })
})

describe('command palette and landing', () => {
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

  test('the palette offers the settings pages to a signed-in user: by page name, or all by «Настройки»', () => {
    expect(paletteSettings(null, '')).toEqual([])
    const all = ['/settings/profile', '/settings/security', '/settings/appearance', '/settings/notifications']
    expect(paletteSettings(session([]), '').map(page => page.to)).toEqual(all)
    expect(paletteSettings(session([]), ` ${m.platform_page_settings().slice(0, 5)}`).map(page => page.to)).toEqual(all)
    const security = m.platform_tab_security().slice(0, 4).toUpperCase()
    expect(paletteSettings(session([]), security).map(page => page.to)).toEqual(['/settings/security'])
    expect(paletteSettings(session([]), 'zzzz')).toEqual([])
  })

  test('B-CAT-01 the landing lead skips a description that only repeats the name', () => {
    expect(landingLead({ name: 'Ashyq Bilim', description: 'Ashyq Bilim', about: 'Платформа' })).toBe('Платформа')
    expect(landingLead({ name: 'A', description: 'Курсы', about: 'Платформа' })).toBe('Курсы')
    expect(landingLead({ name: 'A', description: ' a ', about: '' })).toBeUndefined()
    // prod: "about" opens with the name the heading already shows
    expect(
      landingLead({
        name: 'Ashyq Bilim',
        description: 'Ashyq Bilim',
        about: 'Ashyq Bilim - образовательная платформа',
      }),
    ).toBe('Образовательная платформа')
    expect(landingLead({ name: 'Ashyq', description: 'Ashyqtau курсы', about: '' })).toBe('Ashyqtau курсы')
  })
})

test('B-CAT-12 a palette course hit opens the workspace of a course the user may edit, else the course page', () => {
  expect(paletteCourseTarget({ allowed_actions: ['update', 'publish'] })).toBe('/teach/courses/$courseId')
  expect(paletteCourseTarget({ allowed_actions: ['apply_contributor'] })).toBe('/courses/$courseId')
  expect(paletteCourseTarget({ allowed_actions: [] })).toBe('/courses/$courseId')
})

test('B-CAT-29 the landing texts follow the interface language and fall back to Russian', () => {
  const platform = {
    description: 'Курсы',
    about: 'О нас',
    description_kk: 'Курстар',
    about_kk: ' ',
    about_en: 'About',
  }
  expect(localizedPlatform(platform, 'kk')).toMatchObject({ description: 'Курстар', about: 'О нас' })
  expect(localizedPlatform(platform, 'en')).toMatchObject({ description: 'Курсы', about: 'About' })
  expect(localizedPlatform(platform, 'ru')).toMatchObject({ description: 'Курсы', about: 'О нас' })
  // An older server sends no translations.
  expect(localizedPlatform({ description: 'Курсы', about: '' }, 'en')).toMatchObject({ description: 'Курсы' })
})

test('B-CAT-07 lessons found by name are a section, counted as none when the answer leaves them out', () => {
  const results = { courses: [], collections: [], users: [], next_cursor: null }
  expect(searchCount(results, 'lessons')).toBe(0)
  const lesson = {
    activity_id: 'a',
    activity_type: 'video',
    course_id: 'c',
    course_name: 'SQL',
    title: 'JOIN',
  } as const
  expect(searchCount({ ...results, lessons: [lesson] }, 'lessons')).toBe(1)
})

const user = (id: string) => ({ id, username: id, display_name: id, avatar_key: null })

test('B-CAT-07 a search pages every section: hits add up per section, and only a full last page has more', () => {
  const lesson = {
    activity_id: 'a',
    activity_type: 'video',
    course_id: 'c',
    course_name: 'SQL',
    title: 'JOIN',
  } as const
  const first = { courses: [], collections: [], users: [user('u1'), user('u2')], lessons: [lesson], next_cursor: '2' }
  const merged = mergeSearchPages([first], 2)
  expect(merged.more).toEqual(['users'])
  expect(searchCount(merged.results, 'users')).toBe(2)
  // The next page: one more person, no lessons (the section is absent), no cursor.
  const second = { courses: [], collections: [], users: [user('u3')], next_cursor: null }
  const all = mergeSearchPages([first, second], 2)
  expect(all.results.users.map(each => each.id)).toEqual(['u1', 'u2', 'u3'])
  expect(searchCount(all.results, 'lessons')).toBe(1)
  expect(all.more).toEqual([])
  // A full section on the last page of all is not "more".
  expect(mergeSearchPages([{ ...first, next_cursor: null }], 2).more).toEqual([])
})
