// CARGO_TARGET_DIR per checkout. Cargo names workspace artifacts the same in every checkout (the path is not in the
// hash), so git worktrees sharing one target dir run each other's code. The main checkout keeps the base dir; a linked
// worktree (`just wt`, the pre-push checkout tmp/hooks/push) gets `<base>-<worktree id>`. Base: CARGO_TARGET_DIR, else
// %LOCALAPPDATA%/ashyq-bilim/cargo-target (Windows) or apps/server/target. apps/server/justfile applies the same rule.
// Importing this module sets process.env.CARGO_TARGET_DIR for the checkout it lives in (check, stack, e2e, db).
import { spawnSync } from 'node:child_process'
import { join, resolve } from 'node:path'

export function cargoTargetDir(checkout: string, base = process.env['CARGO_TARGET_DIR']): string {
  const gitDir = spawnSync('git', ['rev-parse', '--absolute-git-dir'], { cwd: checkout, encoding: 'utf8' })
  const id = /\/worktrees\/([^/]+)$/.exec(gitDir.stdout.trim().replaceAll('\\', '/'))?.[1]
  const root =
    base ??
    (process.platform === 'win32'
      ? join(process.env['LOCALAPPDATA'] ?? checkout, 'ashyq-bilim', 'cargo-target')
      : join(checkout, 'apps', 'server', 'target'))
  return !id || root.endsWith(`-${id}`) ? root : `${root}-${id}`
}

process.env['CARGO_TARGET_DIR'] = cargoTargetDir(resolve(import.meta.dir, '../..'))
