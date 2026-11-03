import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'vite-plus/test'

import { checkMessage } from './i18n.ts'
import { type Finding, usesOperation } from './lib.ts'
import { driftedFiles } from './repo.ts'

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

test('shared kk/ru terms warn without blocking, but missing translations and mismatched params still fail', () => {
  const errors: Finding[] = []
  const warnings: Finding[] = []
  checkMessage('catalog_title', 'catalog', { ru: 'Каталог', kk: 'Каталог', en: 'Catalog' }, errors, warnings)
  expect(errors).toEqual([])
  expect(warnings.map(w => w.rule)).toEqual(['i18n-identical'])
  checkMessage('catalog_count', 'catalog', { ru: '{count}', kk: undefined, en: '{total}' }, errors, warnings)
  expect(errors.map(e => e.rule)).toEqual(['i18n-missing-key', 'i18n-params'])
})
