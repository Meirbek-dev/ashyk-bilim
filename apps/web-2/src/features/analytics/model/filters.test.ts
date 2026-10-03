import * as v from 'valibot'
import { describe, expect, test } from 'vite-plus/test'

import {
  activeFilters,
  apiQuery,
  filtersSchema,
  fromFilterForm,
  learnerSort,
  learnersSearchSchema,
  pickFilters,
  tabOf,
  toFilterForm,
} from './filters'

const COURSE = '01a0fe71-945c-760e-a11a-037490019fda'
const defaults = {
  window: '28d',
  compare: 'previous_period',
  bucket: 'day',
  course: undefined,
  cohort: undefined,
} as const

describe('analytics filters', () => {
  test('B-ANL-02 one schema: defaults, and a malformed value falls back instead of breaking the page', () => {
    expect(v.parse(filtersSchema, {})).toEqual(defaults)
    expect(v.parse(filtersSchema, { window: '3d', bucket: 'month', course: 'nope', cohort: 7 })).toEqual(defaults)
    expect(v.parse(filtersSchema, { window: '7d', course: COURSE })).toMatchObject({ window: '7d', course: COURSE })
    expect(v.parse(learnersSearchSchema, { page: 0, sort: 'email', learnerId: 'x' })).toEqual({
      page: 1,
      sort: undefined,
      desc: undefined,
      learnerId: undefined,
      courseId: undefined,
    })
  })

  test('B-ANL-02 every request carries the platform time zone and the contract names', () => {
    const filters = v.parse(filtersSchema, { window: '90d', course: COURSE })
    expect(apiQuery(filters)).toEqual({
      window: '90d',
      compare: 'previous_period',
      bucket: 'day',
      course_ids: COURSE,
      timezone: 'Asia/Almaty',
    })
    expect(apiQuery(filters, { page: 3, sort: 'progress', desc: true })).toMatchObject({
      page: 3,
      page_size: 25,
      sort_by: 'progress',
      sort_order: 'desc',
    })
    expect(apiQuery(filters, { page: 1, sort: 'name' })).toMatchObject({ sort_order: 'asc' })
  })

  test('B-ANL-03 a tab link keeps the filters and drops the page, sort and drill-down', () => {
    const search = { ...defaults, window: '7d' as const, page: 4, sort: 'risk', learnerId: COURSE, courseId: COURSE }
    expect(pickFilters(search)).toEqual({ ...defaults, window: '7d' })
    expect(tabOf('/teach/analytics/learners')).toBe('learners')
    expect(tabOf('/teach/analytics')).toBe('overview')
  })

  test('B-ANL-04 the form round-trips the filters; "all" is an empty choice', () => {
    const filters = v.parse(filtersSchema, { cohort: COURSE })
    expect(toFilterForm(filters)).toMatchObject({ course: '', cohort: COURSE })
    expect(fromFilterForm(toFilterForm(filters))).toEqual(filters)
    expect(activeFilters(filters)).toBe(1)
    expect(activeFilters(v.parse(filtersSchema, { window: '7d', compare: 'none', bucket: 'week' }))).toBe(3)
  })

  test('B-ANL-08 only the keys the at-risk endpoint sorts by reach the URL', () => {
    expect(learnerSort({ id: 'progress', desc: true })).toEqual({ sort: 'progress', desc: true })
    expect(learnerSort({ id: 'risk', desc: false })).toEqual({ sort: 'risk', desc: undefined })
    expect(learnerSort({ id: 'course', desc: false })).toEqual({ sort: undefined, desc: undefined })
    expect(learnerSort(undefined)).toEqual({ sort: undefined, desc: undefined })
  })
})
