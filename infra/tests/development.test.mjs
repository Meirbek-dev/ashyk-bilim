import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join, resolve } from 'node:path'
import { test } from 'node:test'

const root = resolve(import.meta.dirname, '../..')
const just = process.env.JUST_EXECUTABLE ?? 'just'
const run = (command, args, options = {}) => spawnSync(command, args, { encoding: 'utf8', ...options })

test('production release and replacement stands keep separate identity configuration', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ashyq-stands-'))
  try {
    mkdirSync(join(dir, 'infra/scripts'), { recursive: true })
    mkdirSync(join(dir, 'infra/env'), { recursive: true })
    writeFileSync(join(dir, 'infra/scripts/lib.sh'), readFileSync(join(root, 'infra/scripts/lib.sh')))
    writeFileSync(join(dir, 'infra/scripts/web-e2e.sh'), readFileSync(join(root, 'infra/scripts/web-e2e.sh')))
    writeFileSync(join(dir, 'infra/env/smoke.server.env'), 'template\n')
    writeFileSync(join(dir, 'compose.yaml'), 'image: &pg-image test-postgres\n')
    writeFileSync(join(dir, 'compose.prod.yaml'), 'image: &restic-image test-restic\n')
    writeFileSync(join(dir, '.node-version'), readFileSync(join(root, '.node-version')))
    const shell = process.platform === 'win32' ? 'sh' : 'bash'
    const options = { cwd: dir, env: { ...process.env, E2E_WEB_HOST: 'release.test', E2E_PASSWORD: 'fixture-password', PATH: `${dir}${delimiter}${process.env.PATH}` } }
    const result = run(shell, ['-c', 'source infra/scripts/lib.sh; use_web2; printf "old-stand\\n" > "$SERVER_ENV_FILE"; use_web_e2e; cat "$SERVER_ENV_FILE"; cat tmp/web2/server.env'], options)
    assert.equal(result.status, 0, result.stderr)
    assert.equal(result.stdout.replaceAll('\r\n', '\n'), 'template\nold-stand\n')
    writeFileSync(join(dir, 'docker'), '#!/bin/sh\nexit 0\n', { mode: 0o755 })
    const stopped = run(shell, ['infra/scripts/web-e2e.sh', 'down'], options)
    assert.equal(stopped.status, 0, stopped.stderr)
    assert.equal(existsSync(join(dir, 'tmp/web-e2e/server.env')), false)
    assert.equal(readFileSync(join(dir, 'tmp/web2/server.env'), 'utf8'), 'old-stand\n')
    writeFileSync(join(dir, 'docker'), '#!/bin/sh\ncase "$1" in compose) echo edge-fixture; exit;; inspect) echo 192.0.2.1; exit;; esac\nprintf "%s\\n" "$@" > run-args\nfor arg do case "$arg" in docker.io/library/node:*) printf "%s\\n" "$arg";; esac; done\n', { mode: 0o755 })
    const fixture = run(shell, ['infra/scripts/web-e2e.sh', 'fixture'], options)
    assert.equal(fixture.status, 0, fixture.stderr)
    assert.equal(fixture.stdout.trim(), `docker.io/library/node:${readFileSync(join(root, '.node-version'), 'utf8').trim()}-alpine`)
    assert.match(readFileSync(join(dir, 'run-args'), 'utf8'), /--add-host\nrelease\.test:192\.0\.2\.1\n/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

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

// The hooks are bun scripts (CI's infra-gates job installs bun). A fake rustfmt fails on files containing BAD.
test('pre-commit checks the staged snapshot, not the working copy, and refuses edits to pushed migrations', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ashyq-hook-'))
  // Inside a hook (pre-push runs this suite) GIT_DIR & co. point at the real repository.
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')))
  const git = (...args) => {
    const result = run('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', ...args], {
      cwd: dir,
      env,
    })
    assert.equal(result.status, 0, result.stderr)
  }
  const lib = join(dir, 'apps/server/src/lib.rs')
  const migration = join(dir, 'apps/server/migrations/1_a.sql')
  const stage = (path, staged, unstaged) => {
    writeFileSync(path, staged)
    git('add', path)
    if (unstaged !== undefined) writeFileSync(path, unstaged)
  }
  const hook = () =>
    run('sh', ['.vite-hooks/pre-commit'], {
      cwd: dir,
      env: { ...env, PATH: `${join(dir, 'bin')}${delimiter}${process.env.PATH}` },
    })
  try {
    for (const sub of ['.vite-hooks', 'infra/dev', 'apps/server/src', 'apps/server/migrations', 'bin'])
      mkdirSync(join(dir, sub), { recursive: true })
    for (const file of ['.vite-hooks/pre-commit', 'infra/dev/hooks.ts'])
      writeFileSync(join(dir, file), readFileSync(join(root, file)))
    writeFileSync(join(dir, 'apps/server/Cargo.toml'), '[workspace.package]\nedition = "2024"\n')
    writeFileSync(join(dir, 'bin/rustfmt'), '#!/bin/sh\nfor f; do :; done\n! grep -q BAD "$f"\n', { mode: 0o755 })
    // Windows: Bun resolves the .cmd; the file is the 6th argument (rustfmt --check --color never --edition E file).
    const cmd = ['@set f=%~6', '@set f=%f:/=\\%', '@findstr /c:BAD "%f%" >nul && exit /b 1', '@exit /b 0', '']
    writeFileSync(join(dir, 'bin/rustfmt.cmd'), cmd.join('\r\n'))
    writeFileSync(lib, 'ok\n')
    writeFileSync(migration, 'select 1;\n')
    git('init', '-q')
    git('config', 'core.autocrlf', 'false')
    git('add', '.')
    git('commit', '-qm', 'fixture')
    git('update-ref', 'refs/remotes/origin/main', 'HEAD')

    stage(lib, 'staged ok\n', 'BAD unstaged\n')
    let result = hook()
    assert.equal(result.status, 0, `the working copy is not what is committed:\n${result.stdout}${result.stderr}`)
    stage(lib, 'BAD staged\n', 'ok unstaged\n')
    result = hook()
    assert.equal(result.status, 1, result.stdout)
    assert.match(result.stdout, /server rustfmt failed/)
    stage(lib, 'ok\n')

    stage(migration, 'select 2;\n')
    result = hook()
    assert.equal(result.status, 1, result.stdout)
    assert.match(result.stdout, /1_a\.sql is on origin\/main/)
    stage(migration, 'select 1;\n')
    stage(join(dir, 'apps/server/migrations/2_b.sql'), 'select 3;\n')
    result = hook()
    assert.equal(result.status, 0, `${result.stdout}${result.stderr}`)
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

test('server setup loads pinned tools in the POSIX recipe shell', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ashyq-tools-'))
  try {
    writeFileSync(join(dir, 'justfile'), readFileSync(join(root, 'apps/server/justfile')))
    writeFileSync(join(dir, 'tools.env'), 'LINT_TOOLS=lint@1\nTEST_TOOLS=test@2\nDEV_TOOLS=dev@3\n')
    writeFileSync(join(dir, 'cargo'), '#!/bin/sh\nprintf "%s\\n" "$@"\n', { mode: 0o755 })
    const result = run(just, ['setup'], {
      cwd: dir,
      env: { ...process.env, PATH: `${dir}${delimiter}${process.env.PATH}` },
    })
    assert.equal(result.status, 0, result.stderr)
    assert.ok(result.stdout.includes('binstall\n-y\nlint@1\ntest@2\ndev@3'), result.stdout)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
