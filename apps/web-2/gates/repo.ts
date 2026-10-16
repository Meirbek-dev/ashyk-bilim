// Gates that need tools or git: G-04 knip, G-09 codegen drift (G-13 freeze lifted).
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { basename, relative, resolve } from 'node:path'

import * as v from 'valibot'

import { generateApi, generateRouteTree } from './codegen.ts'
import { appDir, type Finding } from './lib.ts'

// G-13 is lifted while production runs apps/web (rolled back 2026-10-04): apps/web takes normal fixes
// again (DECISIONS "G-13 freeze lifted"). Restore the check (git history) when web-2 goes live for good.
export function freeze(): Finding[] {
  return []
}

export function knip(): Finding[] {
  const result = spawnSync('bunx', ['knip', '--config', 'gates/knip.jsonc', '--no-progress', '--reporter', 'json'], {
    cwd: appDir,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  })
  const parsed = v.safeParse(
    v.object({ issues: v.array(v.record(v.string(), v.unknown())) }),
    JSON.parse(result.stdout || 'null'),
  )
  if (!parsed.success)
    return [{ file: 'gates/knip.jsonc', rule: 'knip', fix: `knip did not run: ${result.stderr.slice(0, 300)}` }]
  const findings: Finding[] = []
  for (const issue of parsed.output.issues) {
    const file = String(issue['file'])
    for (const [kind, list] of Object.entries(issue)) {
      if (!Array.isArray(list)) continue
      for (const item of list) {
        const entry = v.safeParse(v.object({ name: v.string(), line: v.optional(v.number()) }), item)
        const name = entry.success ? entry.output.name : file
        findings.push({
          file,
          line: entry.success ? entry.output.line : undefined,
          rule: `knip-${kind}`,
          fix: `remove unused ${name}`,
        })
      }
    }
  }
  return findings
}

/** G-09: regenerating the API client and the route tree must not change a byte. */
export async function codegenDrift(): Promise<Finding[]> {
  const findings: Finding[] = []
  const scratch = relative(appDir, mkdtempSync(resolve(appDir, 'src/shared/api/gen.check-tmp-'))).replaceAll('\\', '/')
  const scratchTree = `src/routeTree.check-tmp-${basename(scratch)}.ts`
  try {
    generateApi(`./${scratch}`)
    await generateRouteTree(`./${scratchTree}`)
    for (const file of driftedFiles(resolve(appDir, 'src/shared/api/gen'), resolve(appDir, scratch))) {
      findings.push({
        file: `src/shared/api/gen/${file}`,
        rule: 'codegen-drift',
        fix: 'run `bun run codegen` and commit the result',
      })
    }
    if (!sameFile(resolve(appDir, 'src/routeTree.gen.ts'), resolve(appDir, scratchTree))) {
      findings.push({
        file: 'src/routeTree.gen.ts',
        rule: 'codegen-drift',
        fix: 'run `bun run codegen` and commit the result',
      })
    }
  } finally {
    rmSync(resolve(appDir, scratch), { recursive: true, force: true })
    rmSync(resolve(appDir, scratchTree), { force: true })
  }
  return findings
}

const sameFile = (a: string, b: string) => existsSync(a) && existsSync(b) && readFileSync(a).equals(readFileSync(b))
const listAll = (dir: string): string[] =>
  readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter(path => statSync(resolve(dir, path)).isFile())
    .map(path => path.replaceAll('\\', '/'))

/** Files modified, missing or extra in `committed` relative to `regenerated` (absolute directories). */
export const driftedFiles = (committed: string, regenerated: string): string[] =>
  [...new Set([...listAll(committed), ...listAll(regenerated)])].filter(
    file => !sameFile(resolve(committed, file), resolve(regenerated, file)),
  )
