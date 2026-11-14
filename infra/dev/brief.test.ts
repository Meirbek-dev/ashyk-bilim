import { expect, test } from 'bun:test'

import { vcsSummary } from './brief.ts'

const ok = (output = '') => ({ ok: true, output, error: '' })
const failed = (error: string) => ({ ok: false, output: '', error })

test('VCS command failures cannot report a clean working copy or no unpushed commits', () => {
  const summary = vcsSummary(() => failed('fatal: detected dubious ownership in repository'), false)
  expect(summary.lines).toEqual([
    'main: unavailable (fatal: detected dubious ownership in repository)',
    'working copy: unavailable (fatal: detected dubious ownership in repository)',
  ])
})

test('a missing upstream does not hide successfully read working changes', () => {
  const summary = vcsSummary(
    cmd => (cmd[1] === 'log' ? failed('fatal: bad revision') : ok(' M app.ts\n?? new.ts')),
    false,
  )
  expect(summary.lines[0]).toBe('main: unavailable (fatal: bad revision)')
  expect(summary.lines[1]).toBe('working copy: 2 changed file(s):  M app.ts ?? new.ts')
})

test('successful empty VCS output still reports a clean checkout', () => {
  expect(vcsSummary(() => ok(), false).lines).toEqual(['main: 0 unpushed commit(s)', 'working copy: 0 changed file(s)'])
})

test('jj failures remain visible independently of git commit counts', () => {
  const summary = vcsSummary(
    cmd => (cmd[0] === 'git' || cmd[1] === '--version' ? ok() : failed('jj: failed to read working copy')),
    true,
  )
  expect(summary.lines).toEqual([
    'main: 0 unpushed commit(s)',
    'commits above main: unavailable (jj: failed to read working copy)',
    'working copy: unavailable (jj: failed to read working copy)',
  ])
})
