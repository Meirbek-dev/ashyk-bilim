import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join, resolve } from 'node:path'
import { test } from 'node:test'

const root = resolve(import.meta.dirname, '../..')
const just = process.env.JUST_EXECUTABLE ?? 'just'
const run = (command, args, options = {}) => spawnSync(command, args, { encoding: 'utf8', ...options })

test('root server proxy preserves a filter as one argument and bounds build jobs', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ashyq-dev-'))
  try {
    writeFileSync(join(dir, 'cargo'), '#!/bin/sh\nprintf "%s\\n" "$@"\nprintf "jobs=%s\\n" "$CARGO_BUILD_JOBS"\n', { mode: 0o755 })
    const filter = 'test(example with spaces)'
    const env = { ...process.env, PATH: `${dir}${delimiter}${process.env.PATH}` }
    delete env.CARGO_BUILD_JOBS
    const result = run(just, ['server', 'test-unit', '-E', filter], {
      cwd: root,
      env,
    })
    assert.equal(result.status, 0, result.stderr)
    assert.deepEqual(result.stdout.trim().split(/\r?\n/), [
      'nextest', 'run', '--locked', '--workspace', '--lib', '--bins', '-E', filter, 'jobs=4',
    ])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('CI codegen accepts current output and rejects modified, deleted and new artifacts', () => {
  const workflow = readFileSync(join(root, '.github/workflows/ci.yaml'), 'utf8')
  const block = workflow.match(/name: Codegen \(paraglide;[^\n]*\n\s+run: \|\n((?:          [^\n]*\n)+)/)?.[1]
  assert.ok(block, 'codegen CI step must exist')
  const script = block.split('\n').map(line => line.trimStart()).join('\n')
  for (const mode of ['clean', 'modified', 'deleted', 'new']) {
    const dir = mkdtempSync(join(tmpdir(), 'ashyq-codegen-'))
    try {
      mkdirSync(join(dir, 'src/shared/api/gen'), { recursive: true })
      writeFileSync(join(dir, 'src/shared/api/gen/sdk.ts'), 'committed\n')
      writeFileSync(join(dir, 'src/routeTree.gen.ts'), 'committed\n')
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ scripts: { codegen: 'node generate.mjs' } }))
      writeFileSync(join(dir, 'bun'), '#!/bin/sh\nexec node generate.mjs\n', { mode: 0o755 })
      writeFileSync(join(dir, 'generate.mjs'), `import { writeFileSync, unlinkSync } from 'node:fs'
if ('${mode}' === 'modified') writeFileSync('src/routeTree.gen.ts', 'changed\\n')
if ('${mode}' === 'deleted') unlinkSync('src/shared/api/gen/sdk.ts')
if ('${mode}' === 'new') writeFileSync('src/shared/api/gen/new.ts', 'new\\n')
`)
      for (const args of [['init', '-q'], ['add', '.'], ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'fixture']]) {
        const result = run('git', args, { cwd: dir })
        assert.equal(result.status, 0, result.stderr)
      }
      const result = run('sh', ['-ec', script], {
        cwd: dir,
        env: { ...process.env, PATH: `${dir}${delimiter}${process.env.PATH}` },
      })
      assert.equal(result.status === 0, mode === 'clean', `${mode}: ${result.stderr}`)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
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
