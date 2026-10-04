import { createHighlighterCore, type HighlighterCore, type LanguageRegistration } from 'shiki/core'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'

type Grammar = () => Promise<{ default: LanguageRegistration[] }>

// One grammar chunk per language, fetched on first use. The JS regex engine: no 600 KB oniguruma wasm.
const GRAMMARS: Record<string, Grammar> = {
  html: () => import('shiki/langs/html.mjs'),
  css: () => import('shiki/langs/css.mjs'),
  javascript: () => import('shiki/langs/javascript.mjs'),
  typescript: () => import('shiki/langs/typescript.mjs'),
  python: () => import('shiki/langs/python.mjs'),
  java: () => import('shiki/langs/java.mjs'),
  kotlin: () => import('shiki/langs/kotlin.mjs'),
  c: () => import('shiki/langs/c.mjs'),
  cpp: () => import('shiki/langs/cpp.mjs'),
  go: () => import('shiki/langs/go.mjs'),
  rust: () => import('shiki/langs/rust.mjs'),
  markdown: () => import('shiki/langs/markdown.mjs'),
  json: () => import('shiki/langs/json.mjs'),
  bash: () => import('shiki/langs/bash.mjs'),
  sql: () => import('shiki/langs/sql.mjs'),
  yaml: () => import('shiki/langs/yaml.mjs'),
}

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
export const grammarOf = (language: string | null | undefined): string | null => {
  const id = language?.trim().toLowerCase() ?? ''
  const resolved = Object.hasOwn(ALIASES, id) ? (ALIASES[id] ?? id) : id
  return Object.hasOwn(GRAMMARS, resolved) ? resolved : null
}

export const THEMES = { light: 'github-light', dark: 'github-dark' } as const

let core: Promise<HighlighterCore> | null = null

/** The shared highlighter with `language` loaded (code blocks of the editor and the markdown renderer). */
export async function highlighter(language: string): Promise<HighlighterCore> {
  core ??= createHighlighterCore({
    themes: [import('shiki/themes/github-light.mjs'), import('shiki/themes/github-dark.mjs')],
    langs: [],
    engine: createJavaScriptRegexEngine(),
  })
  const ready = await core
  const grammar = Object.hasOwn(GRAMMARS, language) ? GRAMMARS[language] : undefined
  if (grammar && !ready.getLoadedLanguages().includes(language)) await ready.loadLanguage(await grammar())
  return ready
}
