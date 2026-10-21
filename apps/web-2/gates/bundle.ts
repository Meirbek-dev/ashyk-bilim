// Build plugins loaded by vite.config.ts.

import type { Plugin } from 'vite-plus'

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
export const stripResponseValidators: Plugin = {
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
