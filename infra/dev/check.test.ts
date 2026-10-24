import { expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { plan, runGate } from './check.ts'

const gates = (files: string[], all = false) =>
  Object.fromEntries(Object.entries(plan(files, all)).map(([area, list]) => [area, list.map(g => g.name)]))

test('a crate change tests that crate and its dependents only', () => {
  const server = plan(['apps/server/crates/db/src/catalog.rs'], false).server
  expect(server.map(g => g.name)).toEqual(['server:fmt', 'server:clippy', 'server:test'])
  expect(server[2].cmd.join(' ')).toContain('-E rdeps(ab-db)')
})

test('a migration runs every server test and an API change checks the contract', () => {
  const migration = plan(['apps/server/migrations/20990101000000_x.sql'], false).server
  expect(migration.find(g => g.name === 'server:test')?.cmd).not.toContain('-E')
  expect(gates(['apps/server/crates/api/src/app.rs']).server).toContain('server:openapi')
})

test('a contract change re-checks both clients', () => {
  const areas = gates(['apps/server/openapi.v2.json'])
  expect(areas.web).toContain('web:contracts')
  expect(areas.web2).toContain('web2:gates')
})

test('docs alone run nothing; --all runs every area', () => {
  expect(gates(['docs/RUNBOOK.md'])).toEqual({})
  expect(Object.keys(gates([], true)).sort()).toEqual(['infra', 'server', 'web', 'web2'])
})

test('browser checks bound worker concurrency while other areas run', () => {
  const gate = plan(['apps/web-2/src/shared/components/testing.tsx'], false).web2.find(g => g.name === 'web2:test')
  expect(gate?.cmd).toContain('--maxWorkers=2')
})

test('server gates bound compilation and use the committed .sqlx cache', () => {
  for (const gate of plan(['apps/server/crates/api/src/app.rs'], false).server ?? [])
    if (gate.name !== 'server:fmt') {
      expect(gate.env?.['SQLX_OFFLINE']).toBe('true')
      expect(gate.env?.['CARGO_BUILD_JOBS']).toBe(process.env['CARGO_BUILD_JOBS'] ?? '4')
    }
})

test('a gate log is readable before the child exits', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ashyq-check-'))
  const release = join(dir, 'release')
  const script = join(dir, 'child.ts')
  writeFileSync(
    script,
    `console.log('started'); while (!(await Bun.file(${JSON.stringify(release)}).exists())) await Bun.sleep(10); console.error('finished'); process.exit(7)`,
  )
  const result = runGate({ name: 'test:live', cwd: dir, cmd: ['bun', script] }, dir)
  try {
    const log = join(dir, 'test-live.log')
    const deadline = Date.now() + 5000
    while (!readFileSync(log, 'utf8').includes('started') && Date.now() < deadline) await Bun.sleep(10)
    expect(readFileSync(log, 'utf8')).toContain('started')
  } finally {
    writeFileSync(release, '')
    const completed = await result
    try {
      expect(completed.ok).toBe(false)
      expect(readFileSync(completed.log, 'utf8')).toContain('finished')
      expect(readFileSync(completed.log, 'utf8')).toContain('check: exit 7')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }
})

test('a failed native process start is logged and completes the gate', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ashyq-check-'))
  try {
    const result = await runGate({ name: 'test:missing', cwd: dir, cmd: [join(dir, 'missing-command')] }, dir)
    expect(result.ok).toBe(false)
    expect(readFileSync(result.log, 'utf8')).toContain('check: spawn')
    expect(readFileSync(result.log, 'utf8')).toContain('missing-command')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
