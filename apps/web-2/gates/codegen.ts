// Code generation (`bun run codegen`): API client, route tree, message functions.
// The drift gate (G-09, gates.ts) calls generateApi / generateRouteTree into scratch locations and diffs.
// Safe while `vp dev` serves: every output is generated into a scratch sibling and published by `publish`.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { compile, type CompilerOptions } from '@inlang/paraglide-js'
import { Generator, getConfig } from '@tanstack/router-generator'

import { appDir } from './lib.ts'

function run(command: string, args: string[], env: Record<string, string> = {}): string {
  const result = spawnSync(command, args, {
    cwd: appDir,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    env: { ...process.env, ...env },
  })
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed:\n${result.stdout}${result.stderr}`)
  return result.stdout
}

// Paraglide options, shared with the Vite plugin (vite.config.ts) so dev, build and codegen agree.
// They cannot live in project.inlang/paraglide.config.ts: inlang gitignores everything there but settings.json.
// No locale in the URL (spec 7.9): cookie, then Accept-Language, then ru.
export const paraglideOptions = {
  project: './project.inlang',
  outdir: './src/paraglide',
  // `custom-printed` answers only on the URL printed on a certificate PDF: that page speaks the certificate's language
  // and leaves the visitor's own alone (src/shared/i18n/printed-locale.ts). Not `routeStrategies`: its URLPattern
  // polyfill costs 24 KB of initial JS.
  strategy: ['custom-printed', 'cookie', 'preferredLanguage', 'baseLocale'],
  cookieName: 'ab_locale',
  emitTsDeclarations: true,
} satisfies CompilerOptions

/** src/shared/api/gen from ../server/openapi.v2.json (config: openapi-ts.config.ts). */
export function generateApi(outputDir = './src/shared/api/gen'): void {
  // TypeScript 7 has no compiler JS API: the generator runs with the `typescript-6` alias (gates/ts6-register.mjs).
  run('node', ['--import', './gates/ts6-register.mjs', './node_modules/@hey-api/openapi-ts/dist/run.mjs'], {
    OPENAPI_OUTPUT: outputDir,
  })
}

// The footer TanStack Start's Vite plugin appends; kept identical so `vp dev` and codegen write the same bytes.
// With src/start.ts present the plugin also registers its options (serialization adapters).
const START_FOOTER = [
  `import type { getRouter } from './router.tsx'
import type { startInstance } from './start.ts'
declare module '@tanstack/react-start' {
  interface Register {
    ssr: true
    router: Awaited<ReturnType<typeof getRouter>>
    config: Awaited<ReturnType<typeof startInstance.getOptions>>
  }
}`,
]

/** src/routeTree.gen.ts from src/routes (normally written by the Vite plugin on dev/build). */
export async function generateRouteTree(outputFile = './src/routeTree.gen.ts'): Promise<void> {
  const config = getConfig(
    {
      target: 'react',
      routesDirectory: './src/routes',
      generatedRouteTree: outputFile,
      routeTreeFileFooter: START_FOOTER,
      disableLogging: true,
    },
    appDir,
  )
  await new Generator({ config, root: appDir }).run()
}

const filesIn = (dir: string): string[] =>
  readdirSync(dir, { recursive: true, encoding: 'utf8' }).filter(file => statSync(join(dir, file)).isFile())

/** renameSync over a file another process may be reading (Windows answers EPERM/EBUSY for a moment). */
function replaceFile(from: string, to: string): void {
  for (let attempt = 1; ; attempt++) {
    try {
      renameSync(from, to)
      return
    } catch (error) {
      const busy =
        error instanceof Error && 'code' in error && ['EPERM', 'EBUSY', 'EACCES'].includes(String(error.code))
      if (attempt >= 40 || !busy) throw error
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50)
    }
  }
}

/**
 * Moves generator output from `scratch` onto `target` (a file or a directory) so a running dev server never sees a
 * half-written or deleted module: unchanged files stay untouched (no reload), changed ones are replaced by a rename,
 * files the generator no longer writes are removed. Returns the number of files changed.
 */
export function publish(scratch: string, target: string): number {
  if (statSync(scratch).isFile()) {
    if (existsSync(target) && readFileSync(target).equals(readFileSync(scratch))) return 0
    replaceFile(scratch, target)
    return 1
  }
  const fresh = new Set(filesIn(scratch))
  let changed = 0
  for (const file of fresh) {
    const to = join(target, file)
    if (existsSync(to) && readFileSync(to).equals(readFileSync(join(scratch, file)))) continue
    mkdirSync(dirname(to), { recursive: true })
    replaceFile(join(scratch, file), to)
    changed++
  }
  for (const file of existsSync(target) ? filesIn(target) : []) {
    if (fresh.has(file)) continue
    rmSync(join(target, file))
    changed++
  }
  return changed
}

/** Runs `generate(scratchPath)` and publishes the result onto `target` (paths relative to the app). */
async function generateInto(target: string, generate: (scratch: string) => unknown): Promise<number> {
  const isFile = target.endsWith('.ts')
  const scratch = isFile
    ? target.replace(/\.ts$/, `.codegen-tmp-${process.pid}.ts`)
    : relative(appDir, mkdtempSync(resolve(appDir, `${target}.codegen-tmp-`))).replaceAll('\\', '/')
  try {
    await generate(`./${scratch}`)
    return publish(resolve(appDir, scratch), resolve(appDir, target))
  } finally {
    rmSync(resolve(appDir, scratch), { recursive: true, force: true })
  }
}

// `codegen messages`: only the gitignored message functions (CI; the drift gate checks the committed rest).
if (import.meta.main) {
  const messagesOnly = process.argv[2] === 'messages'
  let changed = 0
  if (!messagesOnly) {
    changed += await generateInto('src/shared/api/gen', generateApi)
    changed += await generateInto('src/routeTree.gen.ts', generateRouteTree)
  }
  // src/paraglide is gitignored; compiling it here makes `vp check` work in a fresh worktree.
  changed += await generateInto('src/paraglide', outdir =>
    compile({ ...paraglideOptions, project: `${appDir}/project.inlang`, outdir: resolve(appDir, outdir) }),
  )
  const what = messagesOnly ? 'messages' : 'api client, route tree, messages'
  process.stdout.write(`codegen: ${what} (${changed} files changed)\n`)
}
