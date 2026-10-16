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

test('server gates compile against the committed .sqlx cache, never a live database', () => {
  for (const gate of plan(['apps/server/crates/api/src/app.rs'], false).server ?? [])
    if (gate.name !== 'server:fmt') expect(gate.env?.['SQLX_OFFLINE']).toBe('true')
})
