'use client'

import { createHighlighter } from 'shiki/bundle/web'

/**
 * Singleton Shiki highlighter shared by:
 * - MarkdownCodeBlock (renderer)
 * - AiMarkdownRenderer (streaming preview)
 * - tiptap-extension-code-block-shiki (editor)
 *
 * Uses shiki/bundle/web for optimal browser bundle size.
 */
let highlighterPromise: ReturnType<typeof createHighlighter> | null = null

export const getHighlighter = () => {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: ['github-dark', 'github-light'],
      langs: [
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
        'diff',
        'text',
      ],
    })
  }
  return highlighterPromise
}

/**
 * Highlights code to themed HTML using Shiki dual-theme CSS variables.
 * Falls back to plain text if the language cannot be loaded.
 */
export async function highlightCode(code: string, lang: string): Promise<string> {
  const highlighter = await getHighlighter()

  const loaded = highlighter.getLoadedLanguages()
  if (!loaded.includes(lang)) {
    try {
      await highlighter.loadLanguage(lang as Parameters<typeof highlighter.loadLanguage>[0])
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
