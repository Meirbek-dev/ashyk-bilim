import { describe, expect, test } from 'vite-plus/test'
import * as v from 'valibot'

import type { ImportSettings, PlannedItem } from '#/shared/api/gen/types.gen'

import { commitBody, commitDefaults, commitFormSchema, dotQuotas, type CommitForm } from './commit'

const item = (row: number, draw_group: string | null = null): PlannedItem => ({
  row,
  kind: 'choice',
  title: `№ ${row}`,
  max_score: 1,
  draw_group,
  body: { kind: 'choice', explanation: null, variant: null, prompt: 'Q', prompt_format: 'plain', options: [] },
})

const levels = (counts: Record<string, number>) =>
  Object.entries(counts).flatMap(([group, n]) => Array.from({ length: n }, (_, at) => item(at + 2, group)))

const settings: ImportSettings = {
  title: 'Java exam',
  max_attempts: 3,
  time_limit_seconds: 3300,
  draw_count: 30,
  leveling: true,
  draw_strata: [
    { group: '1', count: 9 },
    { group: '2', count: 12 },
    { group: '3', count: 9 },
  ],
}
const items = levels({ '1': 30, '2': 30, '3': 30 })
const imported = { settings, items }

describe('the create form', () => {
  test('starts from row 1 of the file: blank where DOT had 0, minutes, an exam with a 50 % pass', () => {
    expect(commitDefaults(imported, 'ch-1')).toEqual({
      title: 'Java exam',
      kind: 'exam',
      chapter_id: 'ch-1',
      mode: 'replace',
      apply_settings: false,
      max_attempts: '3',
      time_limit_minutes: '55',
      draw_count: '30',
      partial_credit: false,
      passing_score: '50',
    })
    expect(commitDefaults({ settings: null }, undefined).title).toBe('')
  })

  test('a new test sends the chapter, kind, trimmed title and every setting; 0 or blank means no limit', () => {
    const form: CommitForm = {
      ...commitDefaults(imported, 'ch-1'),
      title: '  Java  ',
      kind: 'quiz',
      max_attempts: '0',
      time_limit_minutes: '',
      passing_score: '60,5',
      partial_credit: true,
    }
    expect(commitBody(form, imported, { into: 'new' })).toEqual({
      target: { mode: 'new', chapter_id: 'ch-1', kind: 'quiz' },
      title: 'Java',
      max_attempts: null,
      time_limit_seconds: null,
      draw_count: 30,
      draw_strata: settings.draw_strata,
      partial_credit: true,
      passing_score: 60.5,
    })
  })

  test('a draw of every question is no draw; a changed draw gets its DOT level quotas again', () => {
    const base = commitDefaults(imported, 'ch-1')
    const all = commitBody({ ...base, draw_count: '90' }, imported, { into: 'new' })
    expect([all.draw_count, all.draw_strata]).toEqual([null, []])
    const twenty = commitBody({ ...base, draw_count: '20' }, imported, { into: 'new' })
    expect([twenty.draw_count, twenty.draw_strata]).toEqual([
      20,
      [
        { group: '1', count: 6 },
        { group: '2', count: 8 },
        { group: '3', count: 6 },
      ],
    ])
    const flat = commitBody(base, { settings: { ...settings, leveling: false }, items }, { into: 'new' })
    expect(flat.draw_strata).toEqual([])
  })

  test('an existing test gets only the target, unless the file settings are applied', () => {
    const into = { into: 'test', assessmentId: 'as-1', activityId: 'ac-1' } as const
    const base = commitDefaults(imported, undefined)
    expect(commitBody({ ...base, mode: 'append' }, imported, into)).toEqual({
      target: { mode: 'append', assessment_id: 'as-1' },
    })
    expect(commitBody({ ...base, apply_settings: true }, imported, into)).toMatchObject({
      target: { mode: 'replace', assessment_id: 'as-1' },
      apply_settings: true,
      max_attempts: 3,
      time_limit_seconds: 3300,
    })
  })
})

describe('the create form schema', () => {
  test('checks the server ranges and what a new test needs', () => {
    const schema = commitFormSchema({ into: 'new' }, 300)
    const valid = commitDefaults(imported, 'ch-1')
    const failing = (over: Partial<CommitForm>) =>
      v
        .safeParse(schema, { ...valid, ...over })
        .issues?.map(entry => entry.path?.[0]?.key)
        .filter(Boolean)
    expect(failing({})).toBeUndefined()
    expect(failing({ title: ' ', chapter_id: '' })).toEqual(['title', 'chapter_id'])
    expect(failing({ max_attempts: '11', time_limit_minutes: '1441', passing_score: '101' })).toEqual([
      'max_attempts',
      'time_limit_minutes',
      'passing_score',
    ])
    // Every question (300) is no draw and fits; a draw of 250 is past the server's 200, 301 past the file.
    expect(failing({ draw_count: '300' })).toBeUndefined()
    expect(failing({ draw_count: '250' })).toEqual(['draw_count'])
    expect(failing({ draw_count: '301' })).toEqual(['draw_count'])
    // An existing test needs no title or chapter, and checks the (hidden) settings only when it takes them.
    const into = commitFormSchema({ into: 'test', assessmentId: 'a', activityId: 'b' }, 3)
    const loading = { ...valid, title: '', chapter_id: '', draw_count: '30' }
    expect(v.safeParse(into, loading).success).toBe(true)
    expect(v.safeParse(into, { ...loading, apply_settings: true }).success).toBe(false)
  })
})

describe('DOT level quotas', () => {
  test('follow the server formula (draw.rs dot_quotas)', () => {
    expect(dotQuotas(30, levels({ '1': 30, '2': 30, '3': 30 }))).toEqual([
      { group: '1', count: 9 },
      { group: '2', count: 12 },
      { group: '3', count: 9 },
    ])
    expect(dotQuotas(25, levels({ '101': 40, '102': 40 }))).toEqual([
      { group: '101', count: 12 },
      { group: '102', count: 12 },
    ])
    expect(dotQuotas(30, levels({ '201': 40, '202': 40 }))).toEqual([
      { group: '201', count: 20 },
      { group: '202', count: 10 },
    ])
    expect(dotQuotas(30, levels({ '1': 2, '2': 40, '3': 40 }))).toEqual([
      { group: '1', count: 2 },
      { group: '2', count: 12 },
      { group: '3', count: 9 },
    ])
  })
})
