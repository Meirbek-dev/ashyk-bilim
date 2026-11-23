import { StringStream, type StreamParser } from '@codemirror/streamparser'
import { highlightCode, tags, type Tag } from '@lezer/highlight'

import { codeHighlighter } from '../model/code-style'
import type { CodeToken, Highlight } from './languages'

type Tree = Parameters<typeof highlightCode>[1]

/** A Lezer grammar (the code editor's language packages are built on them; they carry their own style tags). */
const lezer =
  (parser: { parse: (input: string) => Tree }): Highlight =>
  code => {
    const lines: CodeToken[][] = [[]]
    highlightCode(
      code,
      parser.parse(code),
      codeHighlighter,
      (text, className) => lines.at(-1)?.push({ text, className }),
      () => lines.push([]),
    )
    return lines
  }

// CodeMirror's names for legacy-mode token styles (as its StreamLanguage reads them), else the tag of the same name.
const LEGACY: Record<string, string> = {
  variable: 'variableName',
  'variable-2': 'variableName.special',
  'string-2': 'string.special',
  def: 'variableName.definition',
  tag: 'tagName',
  attribute: 'attributeName',
  type: 'typeName',
  builtin: 'variableName.standard',
  qualifier: 'modifier',
  error: 'invalid',
  header: 'heading',
  property: 'propertyName',
}
const TAGS = new Map(Object.entries(tags))
const classes = new Map<string, string>()

function styleClass(style: string): string {
  const known = classes.get(style)
  if (known !== undefined) return known
  const found: Tag[] = []
  for (const name of style.split(' ')) {
    let tag: Tag | undefined
    for (const part of (LEGACY[name] ?? name).split('.')) {
      const value = TAGS.get(part)
      if (typeof value === 'function') tag = tag && value(tag)
      else tag ??= value
    }
    if (tag) found.push(tag)
  }
  const className = codeHighlighter.style(found) ?? ''
  classes.set(style, className)
  return className
}

/** A CodeMirror legacy mode (languages without a Lezer grammar), run line by line as CodeMirror runs it. */
const stream =
  (mode: StreamParser<unknown>): Highlight =>
  code => {
    const state = mode.startState?.(2)
    return code.split('\n').map(line => {
      const tokens: CodeToken[] = []
      if (!line) mode.blankLine?.(state, 2)
      const reader = new StringStream(line, 4, 2)
      while (!reader.eol()) {
        const style = mode.token(reader, state)
        // A mode that consumes nothing would never finish the line.
        if (reader.pos === reader.start) reader.next()
        tokens.push({ text: reader.current(), className: style ? styleClass(style) : '' })
        reader.start = reader.pos
      }
      return tokens
    })
  }

// One chunk per language, fetched on first use; the ids are `LANGUAGE_IDS` (languages.ts).
const LANGUAGES: Record<string, () => Promise<Highlight>> = {
  html: async () => {
    const [html, javascript, css] = await Promise.all([
      import('@lezer/html'),
      import('@lezer/javascript'),
      import('@lezer/css'),
    ])
    const nested = html.configureNesting([
      { tag: 'script', parser: javascript.parser },
      { tag: 'style', parser: css.parser },
    ])
    return lezer(html.parser.configure({ wrap: nested }))
  },
  css: async () => lezer((await import('@lezer/css')).parser),
  javascript: async () => lezer((await import('@lezer/javascript')).parser),
  typescript: async () => lezer((await import('@lezer/javascript')).parser.configure({ dialect: 'ts' })),
  python: async () => lezer((await import('@lezer/python')).parser),
  java: async () => lezer((await import('@lezer/java')).parser),
  kotlin: async () => stream((await import('@codemirror/legacy-modes/mode/clike')).kotlin),
  c: async () => lezer((await import('@lezer/cpp')).parser),
  cpp: async () => lezer((await import('@lezer/cpp')).parser),
  go: async () => lezer((await import('@lezer/go')).parser),
  rust: async () => lezer((await import('@lezer/rust')).parser),
  markdown: async () => {
    const { GFM, parser } = await import('@lezer/markdown')
    return lezer(parser.configure(GFM))
  },
  json: async () => stream((await import('@codemirror/legacy-modes/mode/javascript')).json),
  bash: async () => stream((await import('@codemirror/legacy-modes/mode/shell')).shell),
  sql: async () => stream((await import('@codemirror/legacy-modes/mode/sql')).standardSQL),
  yaml: async () => stream((await import('@codemirror/legacy-modes/mode/yaml')).yaml),
}

/** The highlighter of a language id from `LANGUAGE_IDS`. */
export function load(id: string): Promise<Highlight> {
  const loader = Object.hasOwn(LANGUAGES, id) ? LANGUAGES[id] : undefined
  return loader ? loader() : Promise.reject(new Error(`no grammar for ${id}`))
}
