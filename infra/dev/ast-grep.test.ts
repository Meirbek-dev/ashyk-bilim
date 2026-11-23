import { expect, test } from 'bun:test'

import { format, parse } from './ast-grep.ts'

const match = (line: number) =>
  JSON.stringify({
    file: 'apps\\web-2\\src\\a.tsx',
    ruleId: 'no-dynamic-message',
    severity: 'error',
    message: 'No dynamic message keys\nsecond line',
    range: { start: { line } },
  })

test('scan matches print as file:line rule - message, capped at 30 lines', () => {
  const matches = parse(`${match(0)}\nnot json\n${match(4)}\n`)
  expect(format(matches)).toEqual([
    'apps/web-2/src/a.tsx:1 no-dynamic-message - No dynamic message keys',
    'apps/web-2/src/a.tsx:5 no-dynamic-message - No dynamic message keys',
  ])
  const many = format(parse(Array.from({ length: 35 }, (_, i) => match(i)).join('\n')))
  expect(many).toHaveLength(31)
  expect(many.at(-1)).toBe('... and 5 more')
})
