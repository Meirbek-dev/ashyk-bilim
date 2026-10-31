// CARGO_TARGET_DIR per checkout. Cargo names workspace artifacts the same in every checkout (the path is not in the
// hash), so git worktrees sharing one target dir run each other's code. The main checkout keeps the base dir; a linked
// worktree (`just wt`, the pre-push checkout tmp/hooks/push) gets `<base>-<worktree id>`. Base: CARGO_TARGET_DIR, else
// %LOCALAPPDATA%/ashyq-bilim/cargo-target (Windows) or apps/server/target. apps/server/justfile applies the same rule.
// Importing this module sets process.env.CARGO_TARGET_DIR for the checkout it lives in (check, stack, e2e, db).
import { spawnSync } from 'node:child_process'
import { availableParallelism } from 'node:os'
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

// 4 build jobs and 4 test threads bound a Windows laptop's linker memory and the dev Postgres; a 24+ CPU host (ai-server)
// builds with 16 and tests with 12 (a test holds up to 6 of the cluster's 100 connections). apps/server/justfile agrees.
const big = availableParallelism() >= 24
process.env['CARGO_BUILD_JOBS'] ??= big ? '16' : '4'
process.env['NEXTEST_TEST_THREADS'] ??= big ? '12' : '4'
