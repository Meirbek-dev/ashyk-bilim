// Code generation (`bun run codegen`): API client, route tree, message functions.
// The drift gate (G-09, gates.ts) calls generateApi / generateRouteTree into scratch locations and diffs.
import { spawnSync } from 'node:child_process'
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
  strategy: ['cookie', 'preferredLanguage', 'baseLocale'],
  cookieName: 'ab_locale',
  emitTsDeclarations: true,
} satisfies CompilerOptions

/** src/shared/api/gen from ../server/openapi.v2.json (config: openapi-ts.config.ts). */
export function generateApi(outputDir = './src/shared/api/gen'): void {
  run('bunx', ['openapi-ts'], { OPENAPI_OUTPUT: outputDir })
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

if (import.meta.main) {
  generateApi()
  await generateRouteTree()
  // src/paraglide is gitignored; compiling it here makes `vp check` work in a fresh worktree.
  await compile({ ...paraglideOptions, project: `${appDir}/project.inlang`, outdir: `${appDir}/src/paraglide` })
  process.stdout.write('codegen: api client, route tree, messages\n')
}
