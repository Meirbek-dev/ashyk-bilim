export type CodeToken = { text: string; className: string }
/** A loaded language: code in, lines of tokens out (`className` holds the theme's token classes, '' for plain). */
export type Highlight = (code: string) => CodeToken[][]

/** The highlightable languages (`CODE_LANGUAGES` of the editor); grammars load with the first code block (highlight.ts). */
export const LANGUAGE_IDS = [
  'html',
  'css',
  'javascript',
  'typescript',
  'python',
  'java',
  'kotlin',
  'c',
  'cpp',
  'go',
  'rust',
  'markdown',
  'json',
  'bash',
  'sql',
  'yaml',
]
const IDS = new Set<string>(LANGUAGE_IDS)

const ALIASES: Record<string, string> = {
  js: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  py: 'python',
  kt: 'kotlin',
  kts: 'kotlin',
  'c++': 'cpp',
  golang: 'go',
  rs: 'rust',
  md: 'markdown',
  sh: 'bash',
  shell: 'bash',
  yml: 'yaml',
  xml: 'html',
}

/** A highlightable language id for a fence or code block language, or null (plain text). */
export const languageOf = (language: string | null | undefined): string | null => {
  const id = language?.trim().toLowerCase() ?? ''
  const resolved = Object.hasOwn(ALIASES, id) ? (ALIASES[id] ?? id) : id
  return IDS.has(resolved) ? resolved : null
}

const loaded = new Map<string, Highlight>()
const loading = new Map<string, Promise<Highlight>>()
const listeners = new Set<() => void>()

/** A language that has loaded already: code re-highlights synchronously as it streams in. */
export const loadedLanguage = (id: string): Highlight | undefined => loaded.get(id)

/** Calls `listener` whenever a language has loaded (a `useSyncExternalStore` source). */
export function subscribeLanguages(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** A language by id, fetched once. Rejects when its chunk does not load (the code stays plain). */
export function loadLanguage(id: string): Promise<Highlight> {
  if (!IDS.has(id)) return Promise.reject(new Error(`no grammar for ${id}`))
  let pending = loading.get(id)
  if (!pending) {
    pending = import('./highlight').then(async ({ load }) => {
      const highlight = await load(id)
      loaded.set(id, highlight)
      for (const listener of listeners) listener()
      return highlight
    })
    // A failed chunk may load on a later try.
    pending.catch(() => loading.delete(id))
    loading.set(id, pending)
  }
  return pending
}
