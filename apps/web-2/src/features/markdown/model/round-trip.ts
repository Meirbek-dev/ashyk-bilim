import type { JSONContent } from '@tiptap/core'
import { Mathematics } from '@tiptap/extension-mathematics'
import { MarkdownManager } from '@tiptap/markdown'

import { markdownMarked, parseMarkdown } from './parser'
import { hasRawHtml } from './sanitize'
import { markdownSchema } from './schema'

// G-14 for markdown (gates/corpus.ts, tests): text is "lossless" when the markdown editor's round trip (parse into
// the Tiptap document, serialize back) parses to the same document, which is what the one renderer draws.
const MATH = [Mathematics]
const ATTRS = ['level', 'start', 'language', 'latex', 'src', 'alt', 'href', 'checked', 'align', 'colspan', 'rowspan']

/** The rendered structure of markdown: node types with their meaningful values, text runs merged, spacing ignored. */
export function markdownShape(markdown: string): string[] {
  const out: string[] = []
  let text: { marks: string; value: string } | null = null
  const flush = () => {
    if (text && text.value.trim()) out.push(`text${text.marks} value=${text.value.replace(/\s+/g, ' ').trim()}`)
    text = null
  }
  const visit = (node: JSONContent) => {
    if (node.type === 'text') {
      const marks = (node.marks ?? [])
        .map(mark => [
          mark.type,
          ...ATTRS.flatMap(key => (mark.attrs?.[key] ? [`${key}=${String(mark.attrs[key])}`] : [])),
        ])
        .map(parts => ` ${parts.join(':')}`)
        .toSorted()
        .join('')
      if (text?.marks !== marks) flush()
      text = { marks, value: `${text?.value ?? ''}${node.text ?? ''}` }
      return
    }
    flush()
    // Extra blank lines (empty paragraphs) render as nothing.
    if (node.type === 'paragraph' && !node.content?.length) return
    const fields = ATTRS.flatMap(key => {
      const value: unknown = node.attrs?.[key]
      if (value === undefined || value === null) return []
      return [`${key}=${typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : JSON.stringify(value)}`]
    })
    out.push([node.type, ...fields].join(' '))
    for (const child of node.content ?? []) visit(child)
    flush()
  }
  visit(parseMarkdown(markdown, MATH))
  return out
}

let manager: MarkdownManager | null = null

/** Markdown -> editor document -> markdown, as opening and saving it in the markdown editor would. */
export function roundTripMarkdown(markdown: string): string {
  manager ??= new MarkdownManager({ marked: markdownMarked(), extensions: markdownSchema(MATH) })
  return manager.serialize(manager.parse(markdown))
}

export function markdownLosses(markdown: string): { losses: string[]; rawHtml: boolean } {
  const before = markdownShape(markdown)
  const after = markdownShape(roundTripMarkdown(markdown))
  const losses: string[] = []
  for (let index = 0; index < Math.max(before.length, after.length) && losses.length < 3; index += 1) {
    if (before[index] !== after[index]) losses.push(`#${index} ${before[index] ?? '-'} -> ${after[index] ?? '-'}`)
  }
  return { losses, rawHtml: hasRawHtml(markdown) }
}
