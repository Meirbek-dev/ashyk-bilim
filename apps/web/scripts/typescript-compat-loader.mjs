import { pathToFileURL } from 'node:url'

import { findBunStoreFile } from './package-tooling.mjs'

const typescriptEntry = findBunStoreFile('typescript@6.0.3', 'node_modules/typescript/lib/typescript.js')

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'typescript') {
    return {
      shortCircuit: true,
      url: pathToFileURL(typescriptEntry).href,
    }
  }

  return nextResolve(specifier, context)
}
