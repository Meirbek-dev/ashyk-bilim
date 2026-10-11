import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join, resolve } from 'node:path'
import { test } from 'node:test'

const root = resolve(import.meta.dirname, '../..')
const just = process.env.JUST_EXECUTABLE ?? 'just'
const run = (command, args, options = {}) => spawnSync(command, args, { encoding: 'utf8', ...options })

test('failed OpenAPI export preserves the contract and successful export replaces it', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ashyq-openapi-'))
  try {
    writeFileSync(join(dir, 'justfile'), readFileSync(join(root, 'apps/server/justfile')))
    writeFileSync(join(dir, 'openapi.v2.json'), 'committed\n')
    for (const status of [1, 0]) {
      writeFileSync(join(dir, 'cargo'), `#!/bin/sh\nprintf 'generated\\n'\nexit ${status}\n`, { mode: 0o755 })
      const result = run(just, ['openapi'], {
        cwd: dir,
        env: { ...process.env, PATH: `${dir}${delimiter}${process.env.PATH}` },
      })
      assert.equal(result.status === 0, status === 0, result.stderr)
      assert.equal(readFileSync(join(dir, 'openapi.v2.json'), 'utf8'), status === 0 ? 'generated\n' : 'committed\n')
      assert.deepEqual(readdirSync(dir).filter(name => name.startsWith('openapi.')), ['openapi.v2.json'])
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('root server proxy preserves filters, bounds build jobs and defaults to cached SQL', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ashyq-dev-'))
  try {
    writeFileSync(join(dir, 'cargo'), '#!/bin/sh\nprintf "%s\\n" "$@"\nprintf "jobs=%s\\noffline=%s\\n" "$CARGO_BUILD_JOBS" "$SQLX_OFFLINE"\n', { mode: 0o755 })
    const filter = 'test(example with spaces)'
    const env = { ...process.env, PATH: `${dir}${delimiter}${process.env.PATH}` }
    delete env.CARGO_BUILD_JOBS
    delete env.SQLX_OFFLINE
    const result = run(just, ['server', 'test-unit', '-E', filter], {
      cwd: root,
      env,
    })
    assert.equal(result.status, 0, result.stderr)
    assert.deepEqual(result.stdout.trim().split(/\r?\n/), [
      'nextest', 'run', '--locked', '--workspace', '--lib', '--bins', '-E', filter, 'jobs=4', 'offline=true',
    ])
    const online = run(just, ['server', 'sqlx-check'], { cwd: root, env: { ...env, SQLX_OFFLINE: 'true' } })
    assert.equal(online.status, 0, online.stderr)
    assert.deepEqual(online.stdout.trim().split(/\r?\n/), [
      'sqlx', 'prepare', '--check', '--workspace', '--', '--locked', 'jobs=4', 'offline=false',
    ])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('web contract check regenerates and rejects a stale, incomplete or orphaned committed client', () => {
  for (const mode of ['clean', 'modified', 'deleted', 'new']) {
    const dir = mkdtempSync(join(tmpdir(), 'ashyq-contracts-'))
    try {
      const web = join(dir, 'apps/web')
      mkdirSync(join(web, 'scripts'), { recursive: true })
      mkdirSync(join(web, 'src/lib/api/generated/zod'), { recursive: true })
      writeFileSync(join(web, 'scripts/check_contracts.mjs'), readFileSync(join(root, 'apps/web/scripts/check_contracts.mjs')))
      writeFileSync(join(web, 'scripts/postprocess-orval-output.mjs'), '')
      // Stands in for orval: what the current contract generates.
      writeFileSync(join(web, 'scripts/generate-api-types.mjs'), `import { mkdirSync, writeFileSync } from 'node:fs'
const out = process.env.ORVAL_OUTPUT_DIR
mkdirSync(out + '/zod', { recursive: true })
writeFileSync(out + '/index.ts', 'index\\n')
writeFileSync(out + '/zod/a.zod.ts', 'a\\n')
`)
      const committed = join(web, 'src/lib/api/generated')
      writeFileSync(join(committed, 'index.ts'), 'index\n')
      if (mode !== 'deleted') writeFileSync(join(committed, 'zod/a.zod.ts'), mode === 'modified' ? 'stale\n' : 'a\n')
      if (mode === 'new') writeFileSync(join(committed, 'zod/orphan.zod.ts'), 'orphan\n')
      const result = run(process.execPath, ['scripts/check_contracts.mjs'], { cwd: web })
      assert.equal(result.status === 0, mode === 'clean', `${mode}: ${result.stderr}`)
      assert.deepEqual(readdirSync(join(web, 'src/lib/api')), ['generated'], 'scratch output is removed')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }
})

test('pre-commit refuses to verify a staged web-2 file whose working copy differs', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ashyq-hook-'))
  const git = (...args) => {
    const result = run('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', ...args], { cwd: dir })
    assert.equal(result.status, 0, result.stderr)
  }
  try {
    mkdirSync(join(dir, '.vite-hooks'))
    mkdirSync(join(dir, 'apps/web-2'), { recursive: true })
    mkdirSync(join(dir, 'bin'))
    writeFileSync(join(dir, '.vite-hooks/pre-commit'), readFileSync(join(root, '.vite-hooks/pre-commit')))
    writeFileSync(join(dir, 'bin/bun'), '#!/bin/sh\necho "$*" >>"$(git rev-parse --show-toplevel)/bun.log"\n', { mode: 0o755 })
    writeFileSync(join(dir, 'apps/web-2/a.ts'), 'a\n')
    writeFileSync(join(dir, 'apps/web-2/b.ts'), 'b\n')
    git('init', '-q')
    git('config', 'core.autocrlf', 'false')
    git('add', 'apps')
    git('commit', '-qm', 'fixture')
    const hook = () => {
      rmSync(join(dir, 'bun.log'), { force: true })
      const result = run('sh', ['.vite-hooks/pre-commit'], {
        cwd: dir,
        env: { ...process.env, PATH: `${join(dir, 'bin')}${delimiter}${process.env.PATH}` },
      })
      let verified = true
      try {
        readFileSync(join(dir, 'bun.log'))
      } catch {
        verified = false
      }
      return { status: result.status, verified, stderr: result.stderr }
    }
    writeFileSync(join(dir, 'apps/web-2/a.ts'), 'staged\n')
    git('add', 'apps/web-2/a.ts')
    assert.deepEqual(hook(), { status: 0, verified: true, stderr: '' })
    writeFileSync(join(dir, 'apps/web-2/b.ts'), 'unrelated unstaged\n')
    assert.equal(hook().status, 0, 'unstaged edits to other files do not block')
    writeFileSync(join(dir, 'apps/web-2/a.ts'), 'unstaged fix\n')
    const blocked = hook()
    assert.equal(blocked.status, 1)
    assert.equal(blocked.verified, false)
    assert.match(blocked.stderr, /apps\/web-2\/a\.ts/)
    assert.doesNotMatch(blocked.stderr, /b\.ts/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('skill generation removes stale copies and preserves canonical sources', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ashyq-skills-'))
  try {
    mkdirSync(join(dir, 'infra/scripts'), { recursive: true })
    mkdirSync(join(dir, '.agents/skills/example'), { recursive: true })
    mkdirSync(join(dir, '.claude/skills'), { recursive: true })
    writeFileSync(join(dir, '.agents/skills/example/SKILL.md'), 'canonical')
    writeFileSync(join(dir, '.claude/skills/stale.md'), 'stale')
    writeFileSync(join(dir, 'infra/scripts/sync-skills.mjs'), readFileSync(join(root, 'infra/scripts/sync-skills.mjs')))
    const result = run(process.execPath, ['infra/scripts/sync-skills.mjs'], { cwd: dir })
    assert.equal(result.status, 0, result.stderr)
    assert.equal(readFileSync(join(dir, '.claude/skills/example/SKILL.md'), 'utf8'), 'canonical')
    assert.equal(readFileSync(join(dir, '.agents/skills/example/SKILL.md'), 'utf8'), 'canonical')
    assert.throws(() => readFileSync(join(dir, '.claude/skills/stale.md')), { code: 'ENOENT' })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('compiler versions match Docker and local CI executes the backend suite once', () => {
  const read = path => readFileSync(join(root, path), 'utf8')
  const rust = read('apps/server/rust-toolchain.toml').match(/channel = "([\d.]+)"/)?.[1]
  const node = read('.node-version').trim()
  assert.ok(rust)
  assert.ok(read('apps/server/Dockerfile').includes(`rust:${rust}-slim-trixie`))
  for (const path of ['apps/web/Dockerfile', 'apps/web-2/Dockerfile']) assert.ok(read(path).includes(`node:${node}-alpine`))
  const result = run(just, ['--justfile', 'apps/server/justfile', '--dry-run', 'ci'], { cwd: root })
  assert.equal(result.status, 0, result.stderr)
  assert.equal((result.stderr.match(/cargo (?:llvm-cov )?nextest run|cargo llvm-cov nextest/g) ?? []).length, 1)
})
