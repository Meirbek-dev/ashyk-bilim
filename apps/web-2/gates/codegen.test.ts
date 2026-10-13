import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'vite-plus/test'

import { publish } from './codegen.ts'

test('codegen publishes only what changed: unchanged files keep their mtime, stale ones go', () => {
  const dir = mkdtempSync(join(tmpdir(), 'codegen-publish-'))
  try {
    const target = join(dir, 'gen')
    const scratch = join(dir, 'gen.codegen-tmp')
    for (const [root, files] of [
      [target, { 'same.ts': 'a', 'changed.ts': 'old', 'stale.ts': 'x' }],
      [scratch, { 'same.ts': 'a', 'changed.ts': 'new', 'nested/added.ts': 'b' }],
    ] as const) {
      for (const [name, text] of Object.entries(files)) {
        mkdirSync(join(root, name, '..'), { recursive: true })
        writeFileSync(join(root, name), text)
      }
    }
    const past = new Date('2020-01-01')
    utimesSync(join(target, 'same.ts'), past, past)

    expect(publish(scratch, target)).toBe(3)
    expect(statSync(join(target, 'same.ts')).mtime).toEqual(past)
    expect(readFileSync(join(target, 'changed.ts'), 'utf8')).toBe('new')
    expect(readFileSync(join(target, 'nested/added.ts'), 'utf8')).toBe('b')
    expect(existsSync(join(target, 'stale.ts'))).toBe(false)

    writeFileSync(join(dir, 'tree.tmp.ts'), 'tree')
    writeFileSync(join(dir, 'tree.ts'), 'tree')
    expect(publish(join(dir, 'tree.tmp.ts'), join(dir, 'tree.ts'))).toBe(0)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
