// `just e2e web2 --changed`: the web-2 specs a change can reach, from the changed files (the same set `just check`
// reads). A spec is picked when it is the changed file, is named after a changed feature, or uses the message prefixes
// of a changed feature (`m.code_...` for code-arena). Shared code, styles, the shell or the e2e fixtures reach
// everything: then the whole suite runs. Heuristic by design: `just check` and CI still run what it skips.
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const WEB2 = 'apps/web-2/'
// Prefixes every screen uses: they say nothing about which feature changed.
const COMMON = new Set(['ui', 'platform'])
const EVERYTHING = [
  /^src\/shared\//,
  /^src\/styles\//,
  /^src\/server\.ts$/,
  /^src\/router\.tsx$/,
  /^src\/routes\/__root\.tsx$/,
  /^e2e\/(fixtures|playwright\.config)/,
  /^(package\.json|bun\.lock|vite\.config\.ts|serve\.ts)$/,
]

export type Selection = { all: true; why: string } | { all: false; specs: string[] }

type Tree = {
  /** e2e/specs/*.spec.ts file name -> its text. */
  specs: Record<string, string>
  /** A feature's (or a route file's) text, for its message prefixes and imports. */
  read: (path: string) => string
}

const prefixes = (text: string) =>
  new Set([...text.matchAll(/\bm\.([a-z0-9]+)_[a-z0-9_]+\(/g)].map(match => match[1] ?? '').filter(p => !COMMON.has(p)))

/** The specs `files` (repo-relative) can reach; pure over `tree` (tests pass a fake one). */
export function selectSpecs(files: string[], tree: Tree): Selection {
  const picked = new Set<string>()
  const features = new Set<string>()
  const used = new Set<string>()
  for (const file of files.filter(f => f.startsWith(WEB2)).map(f => f.slice(WEB2.length))) {
    if (EVERYTHING.some(pattern => pattern.test(file))) return { all: true, why: file }
    const spec = /^e2e\/specs\/([^/]+\.spec\.ts)$/.exec(file)?.[1]
    if (spec) picked.add(spec)
    const feature = /^src\/features\/([^/]+)\//.exec(file)?.[1]
    if (feature) features.add(feature)
    if (/^src\/routes\//.test(file))
      for (const match of tree.read(file).matchAll(/#\/features\/([a-z0-9-]+)/g)) features.add(match[1] ?? '')
    // A catalog: its keys' prefixes (messages/ru/code.json -> code_*).
    if (/^messages\/[a-z]+\/[^/]+\.json$/.test(file))
      for (const key of Object.keys(JSON.parse(tree.read(file) || '{}') as object)) used.add(key.split('_')[0] ?? '')
  }
  for (const feature of features) for (const prefix of prefixes(tree.read(`src/features/${feature}`))) used.add(prefix)
  for (const [name, text] of Object.entries(tree.specs)) {
    if ([...features].some(feature => name.startsWith(feature))) picked.add(name)
    else if ([...prefixes(text)].some(prefix => used.has(prefix))) picked.add(name)
  }
  return { all: false, specs: [...picked].sort() }
}

/** The real tree of apps/web-2 under `root`: a feature path reads every file below it. */
export function web2Tree(root: string): Tree {
  const app = join(root, WEB2)
  const specsDir = join(app, 'e2e/specs')
  const readAll = (path: string): string => {
    if (!existsSync(path)) return ''
    return readdirSync(path, { withFileTypes: true, recursive: true })
      .filter(entry => entry.isFile() && /\.(ts|tsx)$/.test(entry.name))
      .map(entry => readFileSync(join(entry.parentPath, entry.name), 'utf8'))
      .join('\n')
  }
  return {
    specs: Object.fromEntries(
      readdirSync(specsDir)
        .filter(name => name.endsWith('.spec.ts'))
        .map(name => [name, readFileSync(join(specsDir, name), 'utf8')]),
    ),
    read: path => {
      const full = join(app, path)
      if (!existsSync(full)) return ''
      return path.startsWith('src/features/') && !/\.\w+$/.test(path) ? readAll(full) : readFileSync(full, 'utf8')
    },
  }
}
