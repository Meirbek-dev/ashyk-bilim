import { newTest, type TestForm } from './body-form'

// Test cases as files (B-COD-25), in the old web's shapes so its exports import here: JSON is an array of
// `{ id, is_visible, description, input, expected_output, weight }`, CSV the same columns with a header row.

const COLUMNS = ['id', 'is_visible', 'description', 'input', 'expected_output', 'weight'] as const

/** The cases as the old web exported them (JSON array). */
export const testsToJson = (tests: readonly TestForm[]): string =>
  JSON.stringify(
    tests.map(test => ({
      id: test.id,
      is_visible: test.visible,
      description: test.description,
      input: test.input,
      expected_output: test.expected,
      weight: Number(test.weight) || 1,
    })),
    null,
    2,
  )

const quote = (value: string) => `"${value.replaceAll('"', '""')}"`

/** RFC 4180: every cell quoted, so inputs keep their commas, quotes and line breaks. */
export const testsToCsv = (tests: readonly TestForm[]): string =>
  [
    COLUMNS.join(','),
    ...tests.map(test =>
      [test.id, String(test.visible), test.description, test.input, test.expected, test.weight].map(quote).join(','),
    ),
  ].join('\r\n')

/** RFC 4180 rows: quoted cells may hold `,`, `""` and line breaks. */
function csvRows(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        cell += '"'
        index += 1
      } else if (char === '"') quoted = false
      else cell += char
    } else if (char === '"') quoted = true
    else if (char === ',') {
      row.push(cell)
      cell = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[index + 1] === '\n') index += 1
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += char
  }
  if (cell !== '' || row.length > 0) rows.push([...row, cell])
  return rows.filter(cells => cells.some(value => value.trim() !== ''))
}

type Raw = Partial<Record<(typeof COLUMNS)[number], unknown>>

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** One imported case: a fresh id (the file's may clash with existing cases), the rest as given; weight 1 by default. */
const textOf = (value: unknown): string =>
  typeof value === 'string' ? value : typeof value === 'number' ? String(value) : ''

const caseOf = (raw: Raw): TestForm => {
  const weight = Number(raw.weight)
  return {
    ...newTest(),
    description: textOf(raw.description),
    input: textOf(raw.input),
    expected: textOf(raw.expected_output),
    visible: raw.is_visible === true || raw.is_visible === 'true',
    weight: Number.isInteger(weight) && weight > 0 ? String(weight) : '1',
  }
}

/**
 * The cases of a picked file: a JSON array, or a CSV whose header names `input` and `expected_output`. Null when the
 * file is neither (the caller says so).
 */
export function parseTestsFile(name: string, text: string): TestForm[] | null {
  if (name.toLowerCase().endsWith('.json')) {
    try {
      const parsed: unknown = JSON.parse(text)
      return Array.isArray(parsed) ? parsed.filter(isRecord).map(caseOf) : null
    } catch {
      return null
    }
  }
  const [head, ...rows] = csvRows(text.replace(/^﻿/, ''))
  const header = (head ?? []).map(cell => cell.trim())
  if (!header.includes('input') || !header.includes('expected_output')) return null
  return rows.map(cells => caseOf(Object.fromEntries(header.map((key, index) => [key, cells[index] ?? '']))))
}
