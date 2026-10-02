import type { EditorNode } from './document'
import { normalizeDocument } from './normalize'

// Text that lives in attributes rather than in child text nodes.
const ATTR_TEXT: Record<string, string[]> = {
  flipcard: ['question', 'answer'],
  blockMathEquation: ['math_equation'],
  scenarios: ['title'],
}

function collect(node: EditorNode, out: string[]): void {
  if (typeof node.text === 'string') out.push(node.text)
  const keys = node.type && Object.hasOwn(ATTR_TEXT, node.type) ? ATTR_TEXT[node.type] : undefined
  for (const key of keys ?? []) {
    const value = node.attrs?.[key]
    if (typeof value === 'string' && value.trim()) out.push(value, ' ')
  }
  if (node.type === 'hardBreak') out.push(' ')
  for (const child of node.content ?? []) collect(child, out)
  if (node.content !== undefined || node.type !== 'text') out.push(' ')
}

/** Readable text of stored editor content (summaries, search, AI context); legacy HTML loses its tags. */
export function extractPlainText(raw: unknown): string {
  const doc = normalizeDocument(raw)
  if (typeof doc === 'string')
    return doc
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  const out: string[] = []
  collect(doc, out)
  return out.join('').replace(/\s+/g, ' ').trim()
}
