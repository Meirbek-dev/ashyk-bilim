import { describe, expect, test } from 'vite-plus/test'

import { legacyTarget } from './legacy-urls'

const C = '01a12bb5-3c39-7ecb-94c4-77c332fd192b'
const A = '01a12bb5-3c69-7238-b368-05182efe02ef'

describe('old web URLs', () => {
  test('learner pages move to their web-2 address, with or without the locale prefix and id prefixes', () => {
    expect(legacyTarget('/ru')).toBe('/')
    expect(legacyTarget(`/kz/course/course_${C}`)).toBe(`/courses/${C}`)
    expect(legacyTarget(`/en/course/${C}/activity/activity_${A}`)).toBe(`/learn/${C}/${A}`)
    expect(legacyTarget(`/course/${C}/activity/${A}`)).toBe(`/learn/${C}/${A}`)
    expect(legacyTarget(`/ru/collection/collection_${C}`)).toBe(`/collections/${C}`)
    expect(legacyTarget('/ru/collections/new')).toBe('/collections?create=true')
    expect(legacyTarget('/ru/user/a.b')).toBe('/users/a.b')
    expect(legacyTarget('/ru/trail')).toBe('/learning')
    expect(legacyTarget('/ru/search?q=java&type=courses')).toBe('/search?q=java')
  })

  test('teacher and admin pages move to the studio, analytics and admin', () => {
    expect(legacyTarget('/ru/dash')).toBe('/teach')
    expect(legacyTarget(`/ru/dash/courses/${C}/curriculum`)).toBe(`/teach/courses/${C}/content`)
    expect(legacyTarget(`/ru/dash/courses/${C}/access`)).toBe(`/teach/courses/${C}/publish`)
    expect(legacyTarget(`/ru/dash/courses/${C}/review`)).toBe(`/teach?course=${C}`)
    expect(legacyTarget(`/ru/dash/courses/${C}/activity/${A}/review?submission=submission_${A}`)).toBe(
      `/teach/courses/${C}/activities/${A}/submissions/${A}`,
    )
    expect(legacyTarget(`/ru/editor/course/${C}/activity/${A}/edit`)).toBe(`/teach/courses/${C}/activities/${A}/edit`)
    expect(legacyTarget(`/ru/dash/analytics/assessments/quiz/${A}`)).toBe(
      `/teach/analytics/performance?assessmentType=quiz&assessmentId=${A}`,
    )
    expect(legacyTarget('/ru/dash/users/settings/usergroups')).toBe('/teach/groups')
    expect(legacyTarget('/ru/dash/user-account/settings/gamification')).toBe('/settings/notifications')
  })

  test('sign-in keeps its return path in the new shape; an assessment link is resolved by the route', () => {
    expect(legacyTarget(`/ru/login?returnTo=${encodeURIComponent(`/course/${C}`)}`)).toBe(
      `/login?redirect=${encodeURIComponent(`/courses/${C}`)}`,
    )
    expect(legacyTarget('/ru/auth/signup')).toBe('/signup')
    expect(legacyTarget(`/ru/assessments/${A}?review=${C}`)).toEqual({ assessment: A, review: C })
  })

  test('web-2 pages, the printed certificate URL and unknown paths are not old links', () => {
    for (const path of ['/login?redirect=%2Fhome', '/search?q=a', '/courses', '/', '/teach', '/no/such/page'])
      expect(legacyTarget(path)).toBeNull()
    expect(legacyTarget(`/ru/certificates/ABCD/verify`)).toBeNull()
    expect(legacyTarget('/ru/no-such-page')).toBeNull()
  })
})
