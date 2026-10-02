/** Code block languages offered by the editor and highlighted by shiki (ported from the old web). */
const CODE_LANGUAGES = [
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
] as const

type CodeLanguage = (typeof CODE_LANGUAGES)[number]

const ALIASES: Record<string, CodeLanguage> = {
  ...Object.fromEntries(CODE_LANGUAGES.map(language => [language, language])),
  cts: 'typescript',
  mts: 'typescript',
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  kt: 'kotlin',
  kts: 'kotlin',
  py: 'python',
  xml: 'html',
  'c++': 'cpp',
  golang: 'go',
  rs: 'rust',
  md: 'markdown',
  sh: 'bash',
  shell: 'bash',
  yml: 'yaml',
}

/** A stored `language` attribute: a known language, or null for plain text. */
export function codeLanguage(language: string | null | undefined): CodeLanguage | null {
  const key = language?.trim().toLowerCase() ?? ''
  return Object.hasOwn(ALIASES, key) ? (ALIASES[key] ?? null) : null
}

// Legacy blocks were saved without a language; Kotlin lessons are the only ones we can tell apart.
const KOTLIN_SIGNS: [RegExp, number][] = [
  [/\bdata\s+class\b/, 3],
  [/\b(listOf|mutableListOf|mapOf|mutableMapOf|setOf|firstOrNull)\b/, 2],
  [/\b(groupBy|sortedBy|sortedByDescending)\s*\{/, 2],
  [/\{\s*it\./, 2],
  [/^\s*object\s+\w+/m, 2],
  [/\{\s*\w+\s*->/, 2],
  [/\w+\s*:\s*\([^)]*\)\s*->\s*\w+/, 2],
  [/^\s*(val|var)\s+\w+/m, 1],
  [/\bfun\s+\w+\s*\(/, 1],
  [/\bcompanion\s+object\b/, 1],
]

export const looksLikeKotlin = (text: string): boolean =>
  KOTLIN_SIGNS.reduce((score, [pattern, weight]) => score + (pattern.test(text) ? weight : 0), 0) >= 2
