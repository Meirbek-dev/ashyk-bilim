#!/usr/bin/env bun
// `just contract`: the API contract in one step, after a DTO/route/ErrorCode/upload-policy change on the server.
//   1. export apps/server/openapi.v2.json (`ashyq openapi`)
//   2. accept the insta snapshots that mirror it (the OpenAPI document, the ErrorCode registry)
//   3. regenerate the web-2 client (`bun run codegen`) and the legacy one (`bun run generate:api-types`)
//   4. report what changed and what is still missing (error-code messages, both webs)
// Read the diff, add the missing messages, commit everything with the server change. Logs: tmp/contract/<step>.log.
import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { root } from './lib.ts'

const logDir = join(root, 'tmp/contract')
mkdirSync(logDir, { recursive: true })

function step(name: string, cmd: string[], cwd: string, env: Record<string, string> = {}): string {
  const started = performance.now()
  const result = spawnSync(cmd[0] ?? '', cmd.slice(1), {
    cwd: join(root, cwd),
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1', CARGO_TERM_COLOR: 'never', ...env },
    shell: false,
    maxBuffer: 256 * 1024 * 1024,
  })
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
  writeFileSync(join(logDir, `${name}.log`), `$ ${cmd.join(' ')} (in ${cwd})\n${output}`)
  const seconds = ((performance.now() - started) / 1000).toFixed(0)
  console.log(`${result.status === 0 ? 'ok  ' : 'FAIL'} ${name.padEnd(14)} ${seconds.padStart(4)}s`)
  if (result.status !== 0) {
    console.log(output.trim().split('\n').slice(-12).join('\n'))
    console.log(`contract: stopped at ${name} (tmp/contract/${name}.log)`)
    process.exit(1)
  }
  return output
}

step('openapi', ['just', 'openapi'], 'apps/server')
step(
  'snapshots',
  [
    'cargo',
    'nextest',
    'run',
    '--locked',
    '--workspace',
    '-E',
    'test(openapi_document_snapshot) | test(registry_snapshot)',
  ],
  'apps/server',
  { INSTA_UPDATE: 'always', SQLX_OFFLINE: process.env['SQLX_OFFLINE'] ?? 'true' },
)
step('web2-codegen', ['bun', 'run', 'codegen'], 'apps/web-2')
step('web-codegen', ['bun', 'run', 'generate:api-types'], 'apps/web')

const changed = spawnSync(
  'git',
  [
    'status',
    '--short',
    '--',
    'apps/server/openapi.v2.json',
    'apps/server/crates',
    'apps/web-2/src/shared/api/gen',
    'apps/web/src/lib/api/generated',
  ],
  { cwd: root, encoding: 'utf8' },
).stdout.trim()
console.log(changed ? `changed:\n${changed.split('\n').slice(0, 15).join('\n')}` : 'contract: no change')

// New error codes need a message in every locale of both webs.
const legacy = spawnSync('bun', ['run', 'check:error-codes'], { cwd: join(root, 'apps/web'), encoding: 'utf8' })
// web-2's code-to-message map is exhaustive: a new code fails its type check.
const web2 = spawnSync('bunx', ['vp', 'check', 'src/shared/i18n/errors.ts'], {
  cwd: join(root, 'apps/web-2'),
  encoding: 'utf8',
  shell: false,
})
for (const [name, r] of [
  ['web error-code messages', legacy],
  ['web-2 error-code messages (src/shared/i18n/errors.ts)', web2],
] as const) {
  const tail = `${r.stdout}${r.stderr}`.trim().split('\n').slice(-6).join('\n')
  console.log(r.status === 0 ? `ok   ${name}` : `TODO ${name}:\n${tail}`)
}
