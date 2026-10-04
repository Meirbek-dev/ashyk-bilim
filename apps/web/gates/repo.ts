// Gates that need tools or git: G-04 knip, G-05 budgets, G-09 codegen drift, G-13 freeze.
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { gzipSync } from 'node:zlib'

import * as v from 'valibot'

import { INITIAL_MODULES, type InitialModules } from './bundle.ts'
import { generateApi, generateRouteTree } from './codegen.ts'
import { appDir, type Finding, read, repoDir } from './lib.ts'

function git(args: string[]): { ok: boolean; out: string } {
  const result = spawnSync('git', args, { cwd: repoDir, encoding: 'utf8' })
  return { ok: result.status === 0, out: result.stdout.trim() }
}

export function freeze(): Finding[] {
  const fix = 'apps/web is frozen (G-13): revert, or commit an emergency fix with a "Legacy-Hotfix: <reason>" trailer'
  const status = git(['status', '--porcelain', '--', 'apps/web'])
  if (!status.ok) return [{ file: 'apps/web', rule: 'freeze', fix: 'git status failed: the gate cannot run' }]
  const findings: Finding[] = status.out
    .split('\n')
    .filter(Boolean)
    .map(line => ({ file: `../../${line.slice(3)}`, rule: 'freeze', fix }))
  // CI sets GATES_BASE to the pushed range start; locally the base is where HEAD left origin/main.
  const base = process.env['GATES_BASE'] ?? git(['merge-base', 'HEAD', 'origin/main']).out
  if (!base || !git(['rev-parse', '--verify', `${base}^{commit}`]).ok) {
    return [
      ...findings,
      { file: 'apps/web', rule: 'freeze', fix: 'no base commit (set GATES_BASE or fetch origin/main)' },
    ]
  }
  const log = git(['log', '--format=%h%x00%B%x01', `${base}..HEAD`, '--', 'apps/web'])
  for (const commit of log.out.split('\x01').filter(entry => entry.trim())) {
    const [hash, body = ''] = commit.trim().split('\x00')
    if (!/^Legacy-Hotfix:\s*\S/m.test(body)) findings.push({ file: `commit ${hash}`, rule: 'freeze', fix })
  }
  return findings
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
  const scratch = 'src/shared/api/gen.check-tmp'
  const scratchTree = 'src/routeTree.check-tmp.ts'
  try {
    generateApi(`./${scratch}`)
    await generateRouteTree(`./${scratchTree}`)
    for (const file of new Set([...listAll('src/shared/api/gen'), ...listAll(scratch)])) {
      const committed = resolve(appDir, 'src/shared/api/gen', file)
      const regenerated = resolve(appDir, scratch, file)
      if (!existsSync(committed) || !existsSync(regenerated) || !sameFile(committed, regenerated)) {
        findings.push({
          file: `src/shared/api/gen/${file}`,
          rule: 'codegen-drift',
          fix: 'run `bun run codegen` and commit the result',
        })
      }
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
  readdirSync(resolve(appDir, dir), { recursive: true, encoding: 'utf8' })
    .filter(path => statSync(resolve(appDir, dir, path)).isFile())
    .map(path => path.replaceAll('\\', '/'))

const Budgets = v.object({ initialJsGzipKb: v.number(), chunkGzipKb: v.number(), cssGzipKb: v.number() })
const Manifest = v.record(
  v.string(),
  v.object({ file: v.string(), isEntry: v.optional(v.boolean()), imports: v.optional(v.array(v.string())) }),
)

const kb = (file: string) => gzipSync(readFileSync(resolve(appDir, 'dist/client', file))).length / 1024

// What the entry chunk may hold of our code (AGENTS.md "Entry chunk"): every slice would grow it otherwise.
const ENTRY_RULES: [RegExp, string][] = [
  [
    /^src\/shared\/api\/gen\/(sdk\.gen|valibot\.gen|@tanstack\/)/,
    'the generated SDK holds every operation the app uses: use it from loader/component code or import() it',
  ],
  [
    /^src\/features\/(?!platform\/)[^/]+\/(?!route\.tsx?$)/,
    'route-level options and the shell use a feature only through its route.ts, which imports nothing of the feature',
  ],
]

function entryModules(): Finding[] {
  if (!existsSync(resolve(appDir, INITIAL_MODULES)))
    return [{ file: INITIAL_MODULES, rule: 'budgets', fix: 'run `vp build` first' }]
  const modules: InitialModules = JSON.parse(read(INITIAL_MODULES))
  return Object.entries(modules).flatMap(([module, { via }]) => {
    const rule = ENTRY_RULES.find(([pattern]) => pattern.test(module))
    if (!rule) return []
    const chain = via.filter(link => link.startsWith('src/')).join(' > ')
    return [{ file: module, rule: 'entry-chunk', fix: `${rule[1]}; imported via ${chain}` }]
  })
}

/** G-05: gzip sizes of the built client against gates/budgets.json, and what the entry chunk holds. */
export function budgets(): Finding[] {
  const manifestPath = 'dist/client/.vite/manifest.json'
  if (!existsSync(resolve(appDir, manifestPath)))
    return [{ file: manifestPath, rule: 'budgets', fix: 'run `vp build` first' }]
  const limits = v.parse(Budgets, JSON.parse(read('gates/budgets.json')))
  const manifest = v.parse(Manifest, JSON.parse(read(manifestPath)))
  const findings: Finding[] = entryModules()
  const initial = new Set<string>()
  const collect = (key: string) => {
    const chunk = manifest[key]
    if (!chunk || initial.has(chunk.file)) return
    initial.add(chunk.file)
    chunk.imports?.forEach(collect)
  }
  Object.entries(manifest).forEach(([key, chunk]) => chunk.isEntry && collect(key))
  const initialKb = [...initial].reduce((sum, file) => sum + kb(file), 0)
  if (initialKb > limits.initialJsGzipKb) {
    findings.push({
      file: 'dist/client',
      rule: 'budget-initial-js',
      fix: `initial JS ${initialKb.toFixed(1)} KB gzip > ${limits.initialJsGzipKb}: lazy-load`,
    })
  }
  for (const chunk of Object.values(manifest)) {
    const size = kb(chunk.file)
    const limit = chunk.file.endsWith('.css') ? limits.cssGzipKb : limits.chunkGzipKb
    if (size > limit)
      findings.push({
        file: `dist/client/${chunk.file}`,
        rule: 'budget-chunk',
        fix: `${size.toFixed(1)} KB gzip > ${limit}: split it`,
      })
  }
  return findings
}
