import { expect, test } from 'bun:test'

import { selectSpecs, web2Tree } from './e2e-select.ts'

const tree = {
  specs: {
    'code-arena.spec.ts': 'await page.getByText(m.code_run({}, ru)); m.ui_save({}, ru)',
    'grading.spec.ts': 'm.grading_queue({}, ru); m.ui_save({}, ru)',
    'player.spec.ts': 'm.player_next({}, ru)',
  },
  read: (path: string) =>
    ({
      'src/features/code-arena': 'm.code_run(); m.ui_save(); m.player_page_code()',
      'src/routes/_authed/teach.tsx': "import { X } from '#/features/grading'",
      'src/features/grading': 'm.grading_queue()',
      'messages/ru/player.json': '{"player_next": "Дальше"}',
    })[path] ?? '',
}
const pick = (...files: string[]) =>
  selectSpecs(
    files.map(f => `apps/web-2/${f}`),
    tree,
  )

test('a feature change picks its own specs and those that read its messages, not every ui_ user', () => {
  expect(pick('src/features/code-arena/ui/run-view.tsx')).toEqual({
    all: false,
    specs: ['code-arena.spec.ts', 'player.spec.ts'],
  })
})

test('a route picks the features it imports; a catalog picks its prefix; a spec picks itself', () => {
  expect(pick('src/routes/_authed/teach.tsx')).toEqual({ all: false, specs: ['grading.spec.ts'] })
  expect(pick('messages/ru/player.json')).toEqual({ all: false, specs: ['player.spec.ts'] })
  expect(pick('e2e/specs/grading.spec.ts')).toEqual({ all: false, specs: ['grading.spec.ts'] })
})

test('shared code or the e2e fixtures run everything; other apps run nothing', () => {
  expect(pick('src/shared/components/data-table.tsx')).toEqual({
    all: true,
    why: 'src/shared/components/data-table.tsx',
  })
  expect(pick('e2e/fixtures/test.ts').all).toBe(true)
  expect(selectSpecs(['apps/server/src/main.rs'], tree)).toEqual({ all: false, specs: [] })
})

test('the real tree maps code-arena to its specs', () => {
  const selection = selectSpecs(
    ['apps/web-2/src/features/code-arena/ui/verdict.tsx'],
    web2Tree(`${import.meta.dir}/../..`),
  )
  expect(selection.all).toBe(false)
  if (!selection.all) expect(selection.specs).toContain('code-arena.spec.ts')
})
