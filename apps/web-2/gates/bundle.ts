// Build plugins loaded by vite.config.ts.

import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

import type { Plugin } from 'vite-plus'
import { build, type OutputBundle } from 'vite/rolldown'

// The router's default split leaves `loader` in the route tree, i.e. in the entry chunk with everything it reaches.
export const ROUTE_SPLIT: ('loader' | 'component' | 'pendingComponent' | 'errorComponent' | 'notFoundComponent')[][] = [
  ['loader'],
  ['component'],
  ['pendingComponent'],
  ['errorComponent'],
  ['notFoundComponent'],
]

// Rolldown's default split gave every module the entry shares with a lazy route (router hooks, one module per
// Paraglide message) its own chunk: a first load preloaded 106-184 files, ~70 % under 2 KB. Everything the entry
// reaches is one chunk; the lazy routes' messages are one chunk per catalog (the key's first segment).
// Measured on a production build (/home): 136 -> 37 preloads, 257 -> 225 KB gzip.
const MESSAGE = /[\\/]paraglide[\\/]messages[\\/]([a-z0-9]+)_/
export const CODE_SPLITTING = {
  groups: [
    { name: 'app', tags: ['$initial' as const] },
    { name: (id: string) => `messages-${MESSAGE.exec(id)?.[1] ?? 'other'}`, test: MESSAGE },
  ],
}

// Spec 7.4: responses are validated with the generated Valibot schemas in dev and tests only.
// The production build drops the per-operation validators so the schemas tree-shake out.
const VALIDATOR_LINE = /^\s*responseValidator: async \(data\) => await v\.parseAsync\(\w+, data\),\n/gm
const stripResponseValidators: Plugin = {
  name: 'ab:strip-response-validators',
  apply: 'build',
  transform(code, id) {
    if (!id.replaceAll('\\', '/').endsWith('/shared/api/gen/sdk.gen.ts')) return null
    const stripped = code.replaceAll(VALIDATOR_LINE, '')
    if (stripped.includes('responseValidator'))
      this.error('sdk.gen.ts changed shape: update VALIDATOR_LINE in gates/bundle.ts')
    return { code: stripped, map: null }
  },
}

// REWRITE 7.8: /sw.js (src/shared/pwa/sw.ts) is built after the client bundle, as one classic script, with the list of
// what a first page loads to precache: the entry and its static imports (the whole shell, CODE_SPLITTING `app`) and
// every stylesheet (globals and prose come by `?url` from route heads, not as imports; ~230 KB in all). Its bytes
// change with that list, so every build whose entry changed installs a new worker (and a new asset cache).
const SW_ENTRY = fileURLToPath(new URL('../src/shared/pwa/sw.ts', import.meta.url))

/** The entry chunks, what they import statically, and every stylesheet: `/assets/...` paths, sorted. */
function entryAssets(bundle: OutputBundle): string[] {
  const seen = new Set<string>()
  const visit = (fileName: string) => {
    const chunk = bundle[fileName]
    if (seen.has(fileName) || chunk?.type !== 'chunk') return
    seen.add(fileName)
    for (const css of chunk.viteMetadata?.importedCss ?? []) seen.add(css)
    for (const imported of chunk.imports) visit(imported)
  }
  for (const file of Object.values(bundle)) {
    if (file.type === 'chunk' && file.isEntry) visit(file.fileName)
    if (file.type === 'asset' && file.fileName.endsWith('.css')) seen.add(file.fileName)
  }
  return [...seen]
    .filter(file => file.startsWith('assets/'))
    .map(file => `/${file}`)
    .toSorted()
}

const serviceWorker: Plugin = {
  name: 'ab:service-worker',
  apply: 'build',
  async generateBundle(_options, bundle) {
    if (this.environment.name !== 'client') return
    const precache = entryAssets(bundle)
    const version = createHash('sha256').update(precache.join('\n')).digest('hex').slice(0, 16)
    const built = await build({
      input: SW_ENTRY,
      write: false,
      platform: 'browser',
      transform: { define: { __AB_SW__: JSON.stringify({ version, precache }) } },
      output: { format: 'iife', minify: true },
    })
    const [chunk, ...rest] = built.output
    if (!chunk || rest.some(file => file.type === 'chunk')) this.error('sw.ts must build to one script')
    this.emitFile({ type: 'asset', fileName: 'sw.js', source: chunk.code })
  },
}

/** The build-only plugins of vite.config.ts. */
export const buildPlugins = [stripResponseValidators, serviceWorker]
