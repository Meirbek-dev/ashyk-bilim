import { describe, expect, test } from 'vite-plus/test'

import { parseTestsFile, testsToCsv, testsToJson } from './test-files'

const tests = [
  { id: 't1', description: 'Сумма', input: '1 2\n', expected: '3', visible: true, weight: '1' },
  { id: 't2', description: 'с "кавычками", запятыми', input: 'a,b\nc', expected: 'x', visible: false, weight: '3' },
]

const shape = (rows: ReturnType<typeof parseTestsFile>) =>
  rows?.map(({ description, input, expected, visible, weight }) => ({ description, input, expected, visible, weight }))

describe('test files', () => {
  test('B-COD-25 JSON and CSV exports read back as the same cases, with fresh ids', () => {
    const want = shape(tests.map(item => ({ ...item })))
    const fromJson = parseTestsFile('cases.json', testsToJson(tests))
    expect(shape(fromJson)).toEqual(want)
    expect(fromJson?.some(item => item.id === 't1')).toBe(false)
    expect(shape(parseTestsFile('cases.csv', testsToCsv(tests)))).toEqual(want)
  })

  test('B-COD-25 an old web export imports; a file of another shape is refused', () => {
    const legacy = JSON.stringify([
      { id: 'x', input: '5', expected_output: '25', is_visible: true, match_mode: 'EXACT' },
    ])
    expect(shape(parseTestsFile('old.json', legacy))).toEqual([
      { description: '', input: '5', expected: '25', visible: true, weight: '1' },
    ])
    expect(parseTestsFile('bad.csv', 'name,email\na,b')).toBeNull()
    expect(parseTestsFile('bad.json', '{"not": "an array"}')).toBeNull()
  })
})
