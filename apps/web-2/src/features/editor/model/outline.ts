import type { EditorDocument, EditorNode } from './document'
import { headingIdUpdates } from './heading-ids'

export type OutlineEntry = { id: string; text: string; level: number }

const textOf = (node: EditorNode): string =>
  node.type === 'text' ? (node.text ?? '') : (node.content ?? []).map(textOf).join('')

/**
 * The document with every heading's anchor id set (the authoring rule of `headingIdUpdates`: a stored unique id is
 * kept), and its headings in order: the lesson's "On this page" (B-EDT-26). The view preset renders the ids as they
 * are, so the outline's links and the page's anchors always agree, old documents without ids included.
 */
export function withOutline(doc: EditorDocument): { doc: EditorDocument; outline: OutlineEntry[] } {
  const found: { node: EditorNode; pos: number }[] = []
  const visit = (node: EditorNode) => {
    if (node.type === 'heading') found.push({ node, pos: found.length })
    else for (const child of node.content ?? []) visit(child)
  }
  for (const node of doc.content) visit(node)
  const updates = new Map(
    headingIdUpdates(found.map(({ node, pos }) => ({ pos, id: node.attrs?.['id'], text: textOf(node) }))).map(
      update => [update.pos, update.id],
    ),
  )
  const ids = new Map(found.map(({ node, pos }) => [node, updates.get(pos) ?? String(node.attrs?.['id'])]))
  const apply = (node: EditorNode): EditorNode => {
    const id = ids.get(node)
    if (id !== undefined) return { ...node, attrs: { ...node.attrs, id } }
    return node.content ? { ...node, content: node.content.map(apply) } : node
  }
  return {
    doc: { ...doc, content: doc.content.map(apply) },
    outline: found.map(({ node }) => ({
      id: ids.get(node) ?? '',
      text: textOf(node).trim(),
      level: Number(node.attrs?.['level'] ?? 1),
    })),
  }
}
