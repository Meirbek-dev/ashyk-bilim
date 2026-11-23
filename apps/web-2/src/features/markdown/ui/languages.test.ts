import { describe, expect, test } from 'vite-plus/test'

import { LANGUAGE_IDS, languageOf, loadLanguage } from './languages'

const SAMPLES: Record<string, string> = {
  html: '<p class="a">x</p><script>let y = 1</script>',
  css: 'a { color: red }',
  javascript: 'const x = "s" // c',
  typescript: 'let x: number = 1',
  python: 'def f():\n    return "x"  # c',
  java: 'class A { int x = 1; }',
  kotlin: 'fun main() {\n  val s = "hi" /* c\n  still */\n}',
  c: 'int main() { return 0; }',
  cpp: 'auto x = std::string("s");',
  go: 'func main() { s := "x" }',
  rust: 'fn main() { let s = "x"; }',
  markdown: '# Title\n\n**b** `c`',
  json: '{"a": 1, "b": [true, null]}',
  bash: 'echo "$HOME" # c',
  sql: "SELECT * FROM t WHERE a = 'x' -- c",
  yaml: 'key: value # c',
}

describe('B-MD-01 code highlighting', () => {
  test('B-MD-01 aliases resolve to a language; unknown names are plain text', () => {
    expect([languageOf('py'), languageOf(' TSX '), languageOf('kts'), languageOf('xml')]).toEqual([
      'python',
      'typescript',
      'kotlin',
      'html',
    ])
    expect(languageOf('brainfuck')).toBeNull()
    expect(languageOf(undefined)).toBeNull()
  })

  for (const id of LANGUAGE_IDS)
    test(`B-MD-01 ${id} colors its tokens and keeps the text`, async () => {
      const code = SAMPLES[id] ?? ''
      const lines = (await loadLanguage(id))(code)
      expect(lines.map(line => line.map(token => token.text).join('')).join('\n')).toBe(code)
      expect(lines.flat().some(token => token.className !== '')).toBe(true)
    })

  test('B-MD-01 a block comment spanning lines stays a comment (legacy modes keep their state)', async () => {
    const lines = (await loadLanguage('kotlin'))('/* a\nb */ val x = 1')
    expect(lines[1]?.[0]).toEqual({ text: 'b */', className: 'text-muted-foreground' })
  })
})
