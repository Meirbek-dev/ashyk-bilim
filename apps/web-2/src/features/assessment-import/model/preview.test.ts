import { describe, expect, test } from 'vite-plus/test'

import type { ItemBody, PlannedItem } from '#/shared/api/gen/types.gen'

import { assessmentXlsxHref } from './exports'
import { dotType, previewRows, summaryCounts } from './preview'

const planned = (row: number, body: ItemBody): PlannedItem => ({
  row,
  kind: body.kind,
  title: '',
  max_score: 1,
  draw_group: null,
  body,
})
const choice = (multiple: boolean): ItemBody => ({ kind: 'choice', explanation: null, variant: null, multiple })
const text = (short_answer: boolean): ItemBody => ({ kind: 'open_text', min_words: null, rubric: null, short_answer })

describe('preview', () => {
  test('each question shows its DOT type', () => {
    expect(dotType(planned(2, choice(false)))).toBe('single')
    expect(dotType(planned(2, choice(true)))).toBe('multiple')
    expect(dotType(planned(2, text(true)))).toBe('short')
    expect(dotType(planned(2, text(false)))).toBe('essay')
    expect(dotType(planned(2, { kind: 'matching', explanation: null, pairs: [] }))).toBe('matching')
  })

  test('the header counts only the types the file has, in DOT order', () => {
    const summary = {
      questions: 64,
      single: 60,
      multiple: 0,
      short: 3,
      matching: 0,
      essay: 1,
      images: 6,
      errors: 0,
      warnings: 2,
      infos: 1,
    }
    expect(summaryCounts(summary)).toEqual([
      { type: 'single', count: 60 },
      { type: 'short', count: 3 },
      { type: 'essay', count: 1 },
    ])
  })

  test('a row with issues but no planned question still gets a card, in sheet order', () => {
    const items = [planned(2, choice(false)), planned(5, choice(true))]
    expect(previewRows(items, [1, 4, 5, 9]).map(({ row, item }) => [row, item !== undefined])).toEqual([
      [2, true],
      [4, false],
      [5, true],
      [9, false],
    ])
  })

  test('«Скачать как Excel» is a same-origin link to the export', () => {
    expect(assessmentXlsxHref('as-1')).toBe('/api/v2/assessments/as-1/export')
  })
})
