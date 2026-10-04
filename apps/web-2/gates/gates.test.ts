import { expect, test } from 'vite-plus/test'

import { usesOperation } from './lib.ts'
import { SUPPRESSIONS, titleIds } from './source.ts'

test('an operation counts only when imported from the generated client and used', () => {
  const imported = `import { listCoursesOptions } from '#/shared/api/gen/@tanstack/react-query.gen'
useQuery(listCoursesOptions())`
  expect(usesOperation(imported, 'listCourses')).toBe(true)
  expect(
    usesOperation(
      `// listCourses() is not called here
const listCourses = 1`,
      'listCourses',
    ),
  ).toBe(false)
  expect(usesOperation(`import { listCourses } from '#/shared/api/gen/sdk.gen'`, 'listCourses')).toBe(false)
  const typed = `import type { ExportAtRiskData } from '#/shared/api/gen/types.gen'
const url: ExportAtRiskData['url'] = ''`
  expect(usesOperation(typed, 'exportAtRisk')).toBe(true)
  const lazy = `const { currentSession } = await import('#/shared/api/gen/sdk.gen')
await currentSession()`
  expect(usesOperation(lazy, 'currentSession')).toBe(true)
})

const ids = (source: string) => titleIds(source).map(id => id.text)

test('a behavior id is tested only when it stands in a test title', () => {
  expect(ids(`test('B-COL-02 lists', () => {})`)).toEqual(['B-COL-02'])
  expect(ids(`test.each([1, 2])('B-COL-03 row %s', () => {})`)).toEqual(['B-COL-03'])
  expect(
    ids(`test2(
  'B-NOT-13 speaks kk',
  async () => {})`),
  ).toEqual(['B-NOT-13'])
  expect(
    ids(`// covers B-COL-04
const note = 'B-COL-05'
helper('B-COL-06')`),
  ).toEqual([])
})

test('an unsafe cast is caught in every spelling', () => {
  const unsafe = SUPPRESSIONS.find(([, rule]) => rule === 'unsafe-cast')?.[0]
  // Built from parts so this file does not match itself.
  const [any, never, unknown] = ['any', 'never', 'unknown']
  const casts = [
    `x as ${any}`,
    `x as  ${any}`,
    `x as ${never}`,
    `x as ${unknown}
    as Course`,
  ]
  expect(casts.filter(cast => unsafe?.test(cast))).toEqual(casts)
  expect(unsafe?.test('JSON.parse(raw) as unknown')).toBe(false)
})
