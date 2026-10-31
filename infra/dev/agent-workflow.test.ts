import { expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { lstatSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

import { jobStates, transitions, type Run } from './ci-watch.ts'
import { summarize } from './diagnose.ts'
import { parse, playwrightSummary } from './e2e.ts'

test('persistent stand modes preserve Playwright arguments and reject conflicting lifecycles', () => {
  expect(parse(['web2', '--slot', '2', '--reuse', '--grep', 'B-COL-09'])).toMatchObject({
    app: 'web2',
    slot: '2',
    session: '--reuse',
    args: ['--grep', 'B-COL-09'],
  })
  expect(() => parse(['--serve', '--reuse'])).toThrow('choose only one')
  expect(() => parse(['--dev', '--serve'])).toThrow('production builds')
})

test('CI watcher stays quiet for unchanged polls and reports retried jobs', () => {
  const run: Run = {
    status: 'in_progress',
    conclusion: '',
    url: '',
    jobs: [
      { name: 'e2e (1)', status: 'in_progress', conclusion: '', steps: [{ name: 'setup', status: 'in_progress' }] },
      { name: 'e2e (2)', status: 'completed', conclusion: 'success' },
    ],
  }
  expect(transitions(jobStates(run), run)).toEqual([])
  const previous = jobStates(run)
  run.jobs[0]!.conclusion = 'failure'
  expect(transitions(previous, run)).toEqual(['e2e (1): failure'])
  const failed = jobStates(run)
  run.jobs[0]!.conclusion = ''
  expect(transitions(failed, run)).toEqual(['e2e (1): setup'])
})

async function* lines(values: string[]) {
  yield* values
}

test('diagnostics cap minified matches and total output before returning it', async () => {
  const output = await summarize(lines(Array.from({ length: 100 }, () => `Error: ${'x'.repeat(100_000)}`)))
  expect(output.length).toBeLessThanOrEqual(12_000)
  expect(output).toContain('Error:')
  expect(output).not.toMatch(/^1: Error:/m)
  expect(output).toContain('100: Error:')
})

test('trace diagnostics discard huge snapshots and retain action/error timing', async () => {
  const output = await summarize(
    lines([
      JSON.stringify({ type: 'frame-snapshot', snapshot: 'SECRET-SNAPSHOT'.repeat(1000) }),
      JSON.stringify({ type: 'before', startTime: 123, title: 'Click Save' }),
      JSON.stringify({ type: 'event', time: 125, method: 'pageError', params: { error: 'hydration failed' } }),
    ]),
    true,
  )
  expect(output).toContain('123: Click Save')
  expect(output).toContain('125: "hydration failed"')
  expect(output).not.toContain('SECRET-SNAPSHOT')
})

test('every AGENTS.md is imported by a sibling CLAUDE.md (a plain file: Windows checkouts flatten symlinks)', () => {
  const root = resolve(import.meta.dir, '../..')
  const guides = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '*AGENTS.md'], {
    cwd: root,
  })
    .stdout.toString()
    .split('\n')
    .filter(f => f && !f.startsWith('.agents/') && !f.startsWith('.claude/'))
  expect(guides).toContain('AGENTS.md')
  for (const guide of guides) {
    const claude = join(root, dirname(guide), 'CLAUDE.md')
    expect(lstatSync(claude).isFile()).toBe(true)
    expect(readFileSync(claude, 'utf8')).toContain('@AGENTS.md')
  }
})

test('the e2e summary keeps every count above a long failure list', () => {
  const failures = Array.from({ length: 40 }, (_, i) => `    [chromium] › e2e/specs/a.spec.ts:${i}:1 › B-X-${i} fails`)
  const log = [
    '  1) something',
    '',
    '  40 failed',
    ...failures,
    '  2 flaky',
    '    [chromium] › b.spec.ts:1:1 › t',
    '  417 passed (7.4m)',
    '',
  ].join('\n')
  const out = playwrightSummary(log, 'tmp/e2e/p.log')!
  expect(out.split('\n')[0]).toBe('e2e: 40 failed · 2 flaky · 417 passed (7.4m)')
  expect(out).toContain('B-X-14 fails')
  expect(out).not.toContain('B-X-15 fails')
  expect(out).toContain('just diagnose tmp/e2e/p.log')
  expect(playwrightSummary('  12 passed (3s)\n', 'x')).toBe('e2e: 12 passed (3s)')
  expect(playwrightSummary('Error: no tests found', 'x')).toBeNull()
})

test('server DB tests clone the migrated template instead of replaying every migration', () => {
  const root = resolve(import.meta.dir, '../..')
  const slow = spawnSync('git', ['grep', '-n', '-F', 'sqlx::test(migrations = "', '--', 'apps/server/crates'], {
    cwd: root,
  })
  expect(slow.stdout.toString()).toBe('')
})

test('DECISIONS.md is frozen history: decisions change the doc of the behavior instead', () => {
  const root = resolve(import.meta.dir, '../..')
  const text = readFileSync(join(root, 'docs/DECISIONS.md'), 'utf8')
  expect(text).toContain('Frozen 2026-10-31')
  // 2,872 lines when frozen; typo fixes fit, a new entry does not.
  expect(text.split('\n').length).toBeLessThanOrEqual(2880)
})
