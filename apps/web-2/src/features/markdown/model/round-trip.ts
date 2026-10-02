import { MarkdownManager } from '@tiptap/markdown'
import type { Nodes } from 'mdast'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkParse from 'remark-parse'
import { unified } from 'unified'

import { hasRawHtml } from './sanitize'
import { markdownSchema } from './schema'

// G-14 for markdown (gates/corpus.ts, tests): text is "lossless" when the markdown editor's round trip
// (parse into the Tiptap document, serialize back) renders the same tree in the one renderer (remark + GFM + math).
const processor = unified().use(remarkParse).use(remarkGfm).use(remarkMath)
const KEYS = new Set(['value', 'url', 'lang', 'depth', 'ordered', 'alt', 'checked'])

/** The rendered structure of markdown: node types with their meaningful values, positions and spacing ignored. */
export function markdownShape(markdown: string): string[] {
  const out: string[] = []
  const visit = (node: Nodes) => {
    const fields = Object.entries(node).flatMap(([key, value]: [string, unknown]) => {
      if (!KEYS.has(key) || value === undefined || value === null) return []
      return [`${key}=${typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : JSON.stringify(value)}`]
    })
    out.push([node.type, ...fields].join(' '))
    if ('children' in node) for (const child of node.children) visit(child)
  }
  visit(processor.parse(markdown))
  return out
}

let manager: MarkdownManager | null = null

/** Markdown -> editor document -> markdown, as opening and saving it in the markdown editor would. */
export function roundTripMarkdown(markdown: string): string {
  manager ??= new MarkdownManager({ extensions: markdownSchema() })
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
