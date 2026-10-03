// Build plugins that keep the entry chunk small (G-05), loaded by vite.config.ts.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'

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

/** Written by `vp build` (client) outside dist/client (not served); read by `bun gates/gates.ts budgets`. */
export const INITIAL_MODULES = 'dist/initial-modules.json'

/** Every module of the initial chunks (entry + its static imports): minified bytes, shortest import chain. */
export type InitialModules = Record<string, { bytes: number; via: string[] }>

export function initialModules(): Plugin {
  let root = ''
  return {
    name: 'ab:initial-modules',
    apply: 'build',
    applyToEnvironment: environment => environment.name === 'client',
    configResolved(config) {
      root = config.root
    },
    generateBundle(_options, bundle) {
      const name = (id: string) => {
        const path = relative(root, id.split('?')[0] ?? id).replaceAll('\\', '/')
        const nodeModules = path.lastIndexOf('node_modules/')
        if (nodeModules < 0) return path
        const [scope = '', pkg = ''] = path.slice(nodeModules + 13).split('/')
        return `node_modules/${scope.startsWith('@') ? `${scope}/${pkg}` : scope}`
      }
      const chunks = new Map(
        Object.values(bundle).flatMap(item => (item.type === 'chunk' ? [[item.fileName, item]] : [])),
      )
      const initial = new Set<string>()
      const visit = (file: string) => {
        if (initial.has(file)) return
        initial.add(file)
        chunks.get(file)?.imports.forEach(visit)
      }
      const entries = [...chunks.values()].filter(chunk => chunk.isEntry)
      entries.forEach(chunk => visit(chunk.fileName))
      // Shortest static import chain from the entry, breadth first.
      const parent = new Map<string, string | null>()
      const queue = entries.flatMap(chunk => (chunk.facadeModuleId ? [chunk.facadeModuleId] : []))
      queue.forEach(id => parent.set(id, null))
      for (const id of queue) {
        for (const next of this.getModuleInfo(id)?.importedIds ?? []) {
          if (parent.has(next)) continue
          parent.set(next, id)
          queue.push(next)
        }
      }
      const via = (id: string) => {
        const chain: string[] = []
        for (let step = parent.get(id); step; step = parent.get(step)) chain.unshift(name(step))
        return chain.filter((link, index) => link !== chain[index - 1])
      }
      const modules: InitialModules = {}
      for (const file of initial) {
        for (const [id, module] of Object.entries(chunks.get(file)?.modules ?? {})) {
          const entry = (modules[name(id)] ??= { bytes: 0, via: via(id) })
          entry.bytes += module.renderedLength
        }
      }
      const out = resolve(root, INITIAL_MODULES)
      mkdirSync(dirname(out), { recursive: true })
      writeFileSync(out, `${JSON.stringify(modules, null, 1)}\n`)
    },
  }
}
