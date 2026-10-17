'use client'

import { createHighlighterCore } from 'shiki/core'
import type { HighlighterCore } from 'shiki/core'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'
import { bundledLanguages } from 'shiki/langs'

/**
 * Singleton Shiki highlighter shared by:
 * - MarkdownCodeBlock (renderer)
 * - tiptap-extension-code-block-shiki (editor)
 *
 * Fine-grained core bundle with the JavaScript regex engine: one chunk per
 * grammar and theme, no oniguruma wasm. The editor decorates only loaded
 * languages, so the common set is loaded up front; `highlightCode` fetches
 * anything else from `bundledLanguages` on demand.
 */
const PRELOADED_LANGS = [
  'html',
  'css',
  'javascript',
  'typescript',
  'markdown',
  'json',
  'python',
  'java',
  'kotlin',
  'c',
  'cpp',
  'go',
  'rust',
  'bash',
  'sql',
  'yaml',
  'diff',
] as const

let highlighterPromise: Promise<HighlighterCore> | null = null
let resolvedHighlighter: HighlighterCore | null = null

export const getHighlighter = () => {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighterCore({
      themes: [import('shiki/themes/github-dark.mjs'), import('shiki/themes/github-light.mjs')],
      langs: PRELOADED_LANGS.map(lang => bundledLanguages[lang]),
      // forgiving: an exotic fence language with an unsupported pattern degrades, it does not break the editor.
      engine: createJavaScriptRegexEngine({ forgiving: true }),
    }).then(highlighter => {
      resolvedHighlighter = highlighter
      return highlighter
    })
  }
  return highlighterPromise
}

export const getResolvedHighlighter = () => resolvedHighlighter

/**
 * Highlights code to themed HTML using Shiki dual-theme CSS variables.
 * Falls back to plain text if the language cannot be loaded.
 */
export async function highlightCode(code: string, lang: string): Promise<string> {
  const highlighter = await getHighlighter()

  if (!highlighter.getLoadedLanguages().includes(lang)) {
    const grammar = Object.hasOwn(bundledLanguages, lang)
      ? bundledLanguages[lang as keyof typeof bundledLanguages]
      : null
    try {
      if (!grammar) throw new Error(`unknown language: ${lang}`)
      await highlighter.loadLanguage(grammar)
    } catch {
      lang = 'text'
    }
  }

  return highlighter.codeToHtml(code, {
    lang,
    themes: {
      light: 'github-light',
      dark: 'github-dark',
    },
    defaultColor: false,
  })
}
/** Language display names for known identifiers. */
const LANG_DISPLAY: Record<string, string> = {
  js: 'JavaScript',
  javascript: 'JavaScript',
  ts: 'TypeScript',
  typescript: 'TypeScript',
  tsx: 'TSX',
  jsx: 'JSX',
  py: 'Python',
  python: 'Python',
  rb: 'Ruby',
  ruby: 'Ruby',
  java: 'Java',
  kotlin: 'Kotlin',
  go: 'Go',
  rust: 'Rust',
  c: 'C',
  cpp: 'C++',
  cs: 'C#',
  csharp: 'C#',
  html: 'HTML',
  css: 'CSS',
  scss: 'SCSS',
  json: 'JSON',
  yaml: 'YAML',
  yml: 'YAML',
  md: 'Markdown',
  markdown: 'Markdown',
  bash: 'Bash',
  sh: 'Shell',
  sql: 'SQL',
  diff: 'Diff',
  text: 'Text',
  txt: 'Text',
}

export function getLanguageDisplayName(lang: string | undefined): string {
  if (!lang) return 'Text'
  return LANG_DISPLAY[lang.toLowerCase()] ?? lang.charAt(0).toUpperCase() + lang.slice(1)
}
