// `typescript` -> TypeScript 6 for the API codegen only (see ts6-register.mjs). The hook matches the
// specifier, not the importer path: @hey-api/openapi-ts resolves the hoisted root `typescript` (7.x).
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
const TYPESCRIPT_6 = pathToFileURL(require.resolve('typescript-6')).href

export function resolve(specifier, context, next) {
  if (specifier === 'typescript') return { url: TYPESCRIPT_6, format: 'commonjs', shortCircuit: true }
  return next(specifier, context)
}
