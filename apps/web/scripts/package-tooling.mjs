import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'

export const repoRoot = path.resolve(import.meta.dirname, '..', '..', '..')
const bunStore = path.join(repoRoot, 'node_modules', '.bun')

export function findBunStoreFile(packagePrefix, nestedPath) {
  if (!existsSync(bunStore)) {
    throw new Error(`Bun package store not found at ${bunStore}. Run vp install first.`)
  }

  const matches = readdirSync(bunStore)
    .filter(entry => entry.startsWith(packagePrefix))
    .map(entry => path.join(bunStore, entry, nestedPath))
    .filter(candidate => existsSync(candidate))
    .sort()

  if (matches.length === 0) {
    throw new Error(`Could not find ${nestedPath} for ${packagePrefix} in ${bunStore}.`)
  }

  return matches[0]
}
