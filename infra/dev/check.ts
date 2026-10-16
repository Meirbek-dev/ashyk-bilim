#!/usr/bin/env bun
// `just check [--all] [--staged] [--base <ref>]`: the gates for what changed, one line each; full logs in tmp/check/.
//
// Changed = files that differ from --base (default: where HEAD left origin/main; on main, the unpushed commits) plus
// the working tree (staged, unstaged, untracked), or only the index with --staged. --all runs every gate. The gates
// read the working tree, so run it on the snapshot you mean to push. Areas run in parallel, gates within one in order.
import './cargo-target.ts' // first: CARGO_TARGET_DIR for this checkout, before anything reads or spawns cargo
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { databaseUrl, devEnv } from './lib.ts'

const root = resolve(import.meta.dir, '../..')
const logDir = resolve(root, 'tmp/check')

export type Gate = { name: string; cwd: string; cmd: string[]; env?: Record<string, string> }

const CRATES: Record<string, string> = {
  api: 'ab-api',
  clients: 'ab-clients',
  core: 'ab-core',
  db: 'ab-db',
  domain: 'ab-domain',
  jobs: 'ab-jobs',
  server: 'ashyq-server',
  testkit: 'ab-testkit',
}

// The areas run at once: a legacy test with a 10 s budget (upload-session) timed out under that load.
const LOADED = ['--testTimeout=30000']

// The sqlx macros compile against the committed .sqlx cache: online they would check every query against whatever
// DATABASE_URL names (the tests' half-built ashyq_test failed with 638 errors). Only `prepare`/`sqlx-check` go online.
const OFFLINE = { SQLX_OFFLINE: 'true' }

const isServer = (f: string) => f.startsWith('apps/server/')
const isLegacy = (f: string) => f.startsWith('apps/web/') || f === 'package.json' || f === 'bun.lock'
const isWeb2 = (f: string) => f.startsWith('apps/web-2/')
const isInfra = (f: string) =>
  f.startsWith('infra/') || /^compose[^/]*\.yaml$/.test(f) || f === 'justfile' || f.startsWith('.github/')
const isContract = (f: string) => f === 'apps/server/openapi.v2.json'
const isTs = (f: string) => /\.(ts|tsx|mts|js|mjs|jsx)$/.test(f)

/** The gates per area for `files` (repo-relative, forward slashes); every gate when `all`. */
export function plan(files: string[], all: boolean): Record<string, Gate[]> {
  const server = resolve(root, 'apps/server')
  const web = resolve(root, 'apps/web')
  const web2 = resolve(root, 'apps/web-2')
  const areas: Record<string, Gate[]> = {}

  const serverFiles = files.filter(isServer)
  if (all || serverFiles.length > 0) {
    // A change outside one crate's sources (migrations, .sqlx, Cargo.*) can reach every test.
    const crates = new Set<string>()
    let everything = all
    for (const f of serverFiles) {
      const crate = /^apps\/server\/crates\/([^/]+)\//.exec(f)?.[1]
      if (crate && CRATES[crate]) crates.add(CRATES[crate])
      else if (!/\.(md|txt)$/.test(f)) everything = true
    }
    const filter = everything ? [] : ['-E', [...crates].map(c => `rdeps(${c})`).join(' | ')]
    areas.server = [
      { name: 'server:fmt', cwd: server, cmd: ['cargo', 'fmt', '--all', '--check'] },
      {
        name: 'server:clippy',
        cwd: server,
        cmd: ['cargo', 'clippy', '--locked', '--workspace', '--all-targets', '--', '-D', 'warnings'],
        env: OFFLINE,
      },
      ...(everything || crates.size > 0
        ? [
            {
              name: 'server:test',
              cwd: server,
              cmd: ['cargo', 'nextest', 'run', '--locked', '--workspace', ...filter],
              env: { ...OFFLINE, ...testEnv() },
            },
          ]
        : []),
      // The contract is exported from the API's routes and DTOs (and the domain types they show).
      ...(all || serverFiles.some(f => /^apps\/server\/(crates\/(api|domain|core)\/src|Cargo)/.test(f))
        ? [{ name: 'server:openapi', cwd: root, cmd: ['just', 'server', 'openapi-check'], env: OFFLINE }]
        : []),
    ]
  }

  const contract = all || files.some(isContract)
  const legacyFiles = files.filter(f => f.startsWith('apps/web/'))
  if (all || contract || files.some(isLegacy)) {
    const tsFiles = legacyFiles.filter(isTs).map(f => f.slice('apps/web/'.length))
    areas.web = [
      { name: 'web:typecheck', cwd: web, cmd: ['bun', 'run', 'typecheck'] },
      all || tsFiles.length === 0
        ? { name: 'web:lint', cwd: web, cmd: ['bun', 'run', 'lint'] }
        : { name: 'web:lint', cwd: web, cmd: ['bun', 'run', 'lint', '--no-error-on-unmatched-pattern', ...tsFiles] },
      ...(all
        ? [{ name: 'web:test', cwd: web, cmd: ['node', 'scripts/run-vitest.mjs', 'run', ...LOADED] }]
        : tsFiles.length > 0
          ? [
              {
                name: 'web:test',
                cwd: web,
                cmd: ['node', 'scripts/run-vitest.mjs', 'related', '--run', '--passWithNoTests', ...LOADED, ...tsFiles],
              },
            ]
          : []),
      ...(contract || legacyFiles.some(f => f.startsWith('apps/web/src/messages/') || f.startsWith('apps/web/scripts/'))
        ? [
            { name: 'web:contracts', cwd: web, cmd: ['bun', 'run', 'check:contracts'] },
            { name: 'web:error-codes', cwd: web, cmd: ['bun', 'run', 'check:error-codes'] },
            { name: 'web:messages', cwd: web, cmd: ['bun', 'run', 'check:messages'] },
          ]
        : []),
    ]
  }

  const web2Files = files.filter(isWeb2).map(f => f.slice('apps/web-2/'.length))
  if (all || contract || web2Files.length > 0) {
    const checkable = web2Files.filter(f => existsSync(resolve(web2, f)) && /\.(ts|tsx|js|mjs|json|css)$/.test(f))
    const tests = web2Files.filter(f => existsSync(resolve(web2, f)) && isTs(f) && !f.startsWith('e2e/'))
    areas.web2 = [
      all || checkable.length === 0
        ? { name: 'web2:check', cwd: web2, cmd: ['bunx', 'vp', 'check'] }
        : { name: 'web2:check', cwd: web2, cmd: ['bunx', 'vp', 'check', ...checkable] },
      ...(all
        ? [{ name: 'web2:test', cwd: web2, cmd: ['bunx', 'vp', 'test', 'run'] }]
        : tests.length > 0
          ? [
              {
                name: 'web2:test',
                cwd: web2,
                cmd: ['bunx', 'vp', 'test', 'related', '--run', '--passWithNoTests', ...tests],
              },
            ]
          : []),
      { name: 'web2:gates', cwd: web2, cmd: ['bun', 'gates/gates.ts', 'all'] },
    ]
  }

  if (all || files.some(isInfra)) {
    areas.infra = [
      { name: 'infra:ci-infra', cwd: root, cmd: ['just', 'ci-infra'] },
      { name: 'infra:test-dev', cwd: root, cmd: ['just', 'test-dev'] },
    ]
  }
  return areas
}

/**
 * Integration tests: the dev stack's Postgres (ashyq_test as sqlx::test's master), Redis and storage. 127.0.0.1, not
 * localhost: on Windows `localhost` tries ::1 first and the container relay never answers it.
 */
function testEnv(): Record<string, string> {
  const env = devEnv()
  const v4 = (url: string) => url.replace('//localhost:', '//127.0.0.1:').replace('@localhost:', '@127.0.0.1:')
  return {
    DATABASE_URL: process.env['DATABASE_URL'] ?? v4(databaseUrl(env, 'ashyq_test')),
    TEST_REDIS_URL: process.env['TEST_REDIS_URL'] ?? v4(env['TEST_REDIS_URL'] ?? ''),
    TEST_S3_ENDPOINT: process.env['TEST_S3_ENDPOINT'] ?? v4(env['TEST_S3_ENDPOINT'] ?? ''),
  }
}

function git(args: string[]): string {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' })
  return result.status === 0 ? result.stdout : ''
}

function changedFiles(staged: boolean, base?: string): string[] {
  const lines = (out: string) =>
    out
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean)
  if (staged) return lines(git(['diff', '--cached', '--name-only']))
  const from = base ?? (lines(git(['merge-base', 'HEAD', 'origin/main']))[0] || 'HEAD')
  return [
    ...new Set([
      ...lines(git(['diff', '--name-only', from])),
      ...lines(git(['ls-files', '--others', '--exclude-standard'])),
    ]),
  ]
}

type Result = { gate: Gate; ok: boolean; seconds: number; log: string }

function runGate(gate: Gate): Promise<Result> {
  const log = resolve(logDir, `${gate.name.replace(':', '-')}.log`)
  const started = performance.now()
  return new Promise(done => {
    const child = spawn(gate.cmd[0], gate.cmd.slice(1), {
      cwd: gate.cwd,
      env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0', CARGO_TERM_COLOR: 'never', ...gate.env },
      // No shell: a nextest filter's `|` would become a pipe in cmd.exe (every tool here is an .exe).
      shell: false,
    })
    let output = `$ ${gate.cmd.join(' ')}  (in ${gate.cwd})\n`
    child.stdout.on('data', chunk => (output += chunk))
    child.stderr.on('data', chunk => (output += chunk))
    child.on('close', code => {
      writeFileSync(log, output)
      done({ gate, ok: code === 0, seconds: (performance.now() - started) / 1000, log })
    })
  })
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const all = args.includes('--all')
  const staged = args.includes('--staged')
  const baseAt = args.indexOf('--base')
  const base = baseAt >= 0 ? args[baseAt + 1] : process.env['CHECK_BASE'] || undefined
  mkdirSync(logDir, { recursive: true })

  const files = all ? [] : changedFiles(staged, base)
  const areas = plan(files, all)
  const names = Object.keys(areas)
  if (names.length === 0) {
    console.log(`check: nothing to check (${files.length} changed file(s) outside the gated areas)`)
    return
  }
  console.log(
    `check: ${all ? 'all gates' : `${files.length} changed file(s)`} -> ${names.join(', ')} (logs: tmp/check/)`,
  )
  const results = (
    await Promise.all(
      Object.values(areas).map(async gates => {
        const out: Result[] = []
        for (const gate of gates) {
          const result = await runGate(gate)
          console.log(
            `${result.ok ? 'ok  ' : 'FAIL'} ${gate.name.padEnd(16)} ${result.seconds.toFixed(0).padStart(4)}s`,
          )
          out.push(result)
        }
        return out
      }),
    )
  ).flat()
  const failed = results.filter(r => !r.ok)
  for (const r of failed.slice(0, 2)) {
    const tail = readFileSync(r.log, 'utf8').trim().split('\n').slice(-8)
    console.log(`--- ${r.gate.name}: ${r.log}\n${tail.join('\n')}`)
  }
  if (failed.length > 2) console.log(`--- and ${failed.length - 2} more failed gate(s): see tmp/check/`)
  console.log(
    failed.length === 0
      ? `check: ${results.length} gate(s) passed`
      : `check: ${failed.length} of ${results.length} failed`,
  )
  process.exitCode = failed.length === 0 ? 0 : 1
}

if (import.meta.main) await main()
