import assert from 'node:assert/strict'
import { cpSync, existsSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../..')
const source = join(root, '.agents/skills')
const target = join(root, '.claude/skills')
assert.ok(existsSync(source), 'canonical skills must exist before replacing generated copies')
assert.equal(dirname(target), join(root, '.claude'), 'remove only the generated skills directory')
rmSync(target, { recursive: true, force: true })
cpSync(source, target, { recursive: true })
