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
