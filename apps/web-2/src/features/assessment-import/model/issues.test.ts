import { describe, expect, test } from 'vite-plus/test'

import type { ImportIssue } from '#/shared/api/gen/types.gen'

import {
  bySeverity,
  issueAnchor,
  issueLine,
  issuesByRow,
  issuesReport,
  issueText,
  rowAnchor,
  SETTINGS_ANCHOR,
} from './issues'

const issue = (over: Partial<ImportIssue> & Pick<ImportIssue, 'code'>): ImportIssue => ({
  severity: 'error',
  params: {},
  ...over,
})

describe('issue wording', () => {
  test('a located issue reads as DOT writes it: sheet → cell: text', () => {
    const outOfRange = issue({ code: 'correct_out_of_range', cell: 'C5', row: 5, params: { item: 5, total: 4 } })
    expect(issueLine(outOfRange, 'Лист1')).toBe('Лист1 → C5: варианта 5 нет: всего вариантов 4.')
  })

  test('a file-level issue names only the sheet, or nothing when the file was not read', () => {
    expect(issueLine(issue({ code: 'no_questions' }), 'Тест')).toBe(
      'Тест: в файле нет вопросов: они начинаются со строки 2.',
    )
    expect(issueLine(issue({ code: 'xls_not_supported' }), '')).toBe(
      'формат .xls не поддерживается. Сохраните файл как «Книга Excel (.xlsx)».',
    )
  })

  test('an unknown code or missing params still give a line', () => {
    expect(issueText(issue({ code: 'brand_new_check', params: undefined }))).toBe('проблема в файле (brand_new_check).')
    expect(issueText(issue({ code: 'toString' }))).toBe('проблема в файле (toString).')
    expect(issueText(issue({ code: 'cell_error', params: undefined }))).toBe('в ячейке ошибка Excel ().')
  })

  test('params are worded: hidden row or column, quoted sheet names, plural counts, DOT escapes', () => {
    expect(issueText(issue({ code: 'hidden_cells', params: { row: 7 } }))).toBe('строка 7 скрыта, но импортируется.')
    expect(issueText(issue({ code: 'hidden_cells', params: { column: 'H' } }))).toBe(
      'столбец H скрыт, но импортируется.',
    )
    expect(issueText(issue({ code: 'other_sheets', params: { sheet: 'Тест', names: ['Лист2', 'Лист3'] } }))).toBe(
      'прочитан лист «Тест», листы «Лист2», «Лист3» пропущены.',
    )
    expect(issueText(issue({ code: 'manual_grading', params: { n: 2 } }))).toBe(
      '2 вопроса типа 5 потребуют ручной проверки.',
    )
    expect(issueText(issue({ code: 'unescaped_newlines', params: { cells: ['A53', 'A54'] } }))).toBe(
      '«\\n» заменено переводом строки в ячейках: A53, A54.',
    )
    expect(issueText(issue({ code: 'bold_mismatch', params: { bold: '2', correct: '1' } }))).toBe(
      'жирным выделен вариант 2, а в C указан 1. Учитывается C.',
    )
  })

  test('a long cell list stays one line: the first dozen and how many more', () => {
    const cells = Array.from({ length: 14 }, (_, at) => `E${at + 2}`)
    expect(issueText(issue({ code: 'trimmed', params: { cells, count: 14 } }))).toBe(
      'у ячеек (14) убраны пробелы по краям: E2, E3, E4, E5, E6, E7, E8, E9, E10, E11, E12, E13 … (+2).',
    )
  })
})

describe('issue grouping', () => {
  const serviceCell = issue({ code: 'service_cell', severity: 'warning', cell: 'B1', row: 1 })
  const noOptions = issue({ code: 'no_options', cell: 'E4', row: 4 })
  const trimmed = issue({ code: 'trimmed', severity: 'info', params: { cells: ['E5'], count: 1 } })
  const issues: ImportIssue[] = [
    serviceCell,
    noOptions,
    trimmed,
    issue({ code: 'duplicate_question', severity: 'warning', cell: 'A4', row: 4, params: { row: 2 } }),
    issue({ code: 'formula', cell: 'A9', row: 9 }),
  ]

  test('errors, then warnings, then notes, the server order inside each', () => {
    const groups = bySeverity(issues)
    expect(groups.error.map(entry => entry.code)).toEqual(['no_options', 'formula'])
    expect(groups.warning.map(entry => entry.code)).toEqual(['service_cell', 'duplicate_question'])
    expect(groups.info.map(entry => entry.code)).toEqual(['trimmed'])
  })

  test('a row collects its issues errors first; a file-level one belongs to no row', () => {
    const rows = issuesByRow(issues)
    expect(rows.get(4)?.map(entry => entry.code)).toEqual(['no_options', 'duplicate_question'])
    expect([...rows.keys()].toSorted((a, b) => a - b)).toEqual([1, 4, 9])
  })

  test('a click goes to the question card, row 1 to the settings, a file-level issue nowhere', () => {
    expect(issueAnchor(noOptions)).toBe(rowAnchor(4))
    expect(issueAnchor(serviceCell)).toBe(SETTINGS_ANCHOR)
    expect(issueAnchor(trimmed)).toBeNull()
  })

  test('«Скопировать список» gives one line per issue in page order, and says how many were left out', () => {
    const report = issuesReport({ issues, issues_truncated: 3, sheet: 'Тест' }).split('\n')
    expect(report).toEqual([
      'Тест → E4: не указаны варианты ответа.',
      'Тест → A9: формулы Excel не поддерживаются в шаблоне. Замените формулу её значением или изображением.',
      'Тест → B1: служебная ячейка B1 не используется в Ashyq и пропущена.',
      'Тест → A4: вопрос совпадает с вопросом в строке 2. При выборке учащийся может получить оба.',
      'Тест: у ячеек (1) убраны пробелы по краям: E5.',
      'Не показано сообщений: 3.',
    ])
  })
})
