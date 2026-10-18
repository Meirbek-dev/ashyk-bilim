import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'vite-plus/test'

import { usesOperation } from './lib.ts'
import { driftedFiles } from './repo.ts'
import { nextBehaviorId, SUPPRESSIONS, titleIds } from './source.ts'

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

test('codegen drift catches modified, deleted and new generated files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'codegen-drift-'))
  try {
    const committed = join(dir, 'committed')
    const regenerated = join(dir, 'regenerated')
    for (const root of [committed, regenerated]) {
      mkdirSync(join(root, '@tanstack'), { recursive: true })
      writeFileSync(join(root, 'sdk.gen.ts'), 'same')
      writeFileSync(join(root, '@tanstack/react-query.gen.ts'), 'same')
    }
    expect(driftedFiles(committed, regenerated)).toEqual([])
    writeFileSync(join(committed, '@tanstack/react-query.gen.ts'), 'stale')
    writeFileSync(join(committed, 'orphan.gen.ts'), 'deleted from the contract')
    writeFileSync(join(regenerated, 'types.gen.ts'), 'not committed')
    expect(driftedFiles(committed, regenerated).toSorted()).toEqual([
      '@tanstack/react-query.gen.ts',
      'orphan.gen.ts',
      'types.gen.ts',
    ])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('next-id is one past the highest behavior id of a SPEC, whatever the order', () => {
  expect(nextBehaviorId('- B-ANL-01 a\n- B-ANL-34 b\n- B-ANL-09 c\n')).toBe('B-ANL-35')
  expect(nextBehaviorId('- B-FSB-08 x\n')).toBe('B-FSB-09')
  expect(() => nextBehaviorId('no behaviors yet')).toThrow('no B-<FEAT>-NN line')
})
