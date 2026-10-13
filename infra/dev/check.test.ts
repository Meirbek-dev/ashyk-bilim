import { expect, test } from 'bun:test'

import { plan } from './check.ts'

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

test('web-2 budgets only when bundled code changed', () => {
  expect(gates(['apps/web-2/e2e/specs/auth.spec.ts']).web2).not.toContain('web2:budgets')
  expect(gates(['apps/web-2/src/shared/api/upload.ts']).web2).toContain('web2:budgets')
})
