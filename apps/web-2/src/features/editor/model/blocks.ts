import type { Node as PmNode } from '@tiptap/pm/model'
import { NodeSelection, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state'

/** A top-level block of the page: where it starts and the node. */
export type Block = { pos: number; node: PmNode }

/** The top-level block that holds `pos` (or starts at it); null outside the document. */
export function blockAt(doc: PmNode, pos: number): Block | null {
  if (pos < 0 || pos > doc.content.size) return null
  const $pos = doc.resolve(pos)
  if ($pos.depth > 0) return { pos: $pos.before(1), node: doc.child($pos.index(0)) }
  const node = doc.nodeAt(pos)
  return node ? { pos, node } : null
}

/**
 * The selection after a block moved to `to`: a caret or range inside it moves along, anything else
 * selects the moved block, so the writer sees what moved.
 */
function follow(state: EditorState, tr: Transaction, block: Block, to: number) {
  const { from: start, to: end } = state.selection
  const inside = start >= block.pos && end <= block.pos + block.node.nodeSize
  if (inside && state.selection instanceof TextSelection) {
    return tr.setSelection(TextSelection.create(tr.doc, to + start - block.pos, to + end - block.pos))
  }
  return tr.setSelection(NodeSelection.create(tr.doc, to))
}

/** Moves the block at `pos` one place up or down (keyboard and the block menu); null at either end. */
export function moveBlock(state: EditorState, pos: number, direction: -1 | 1): Transaction | null {
  const block = blockAt(state.doc, pos)
  if (!block) return null
  const index = state.doc.resolve(block.pos).index(0)
  const neighbour = index + direction
  if (neighbour < 0 || neighbour >= state.doc.childCount) return null
  const other = state.doc.child(neighbour)
  const to = direction < 0 ? block.pos - other.nodeSize : block.pos + other.nodeSize
  const tr = state.tr.delete(block.pos, block.pos + block.node.nodeSize).insert(to, block.node)
  return follow(state, tr, block, to).scrollIntoView()
}

/** A copy of the block right after it, selected. */
export function duplicateBlock(state: EditorState, pos: number): Transaction | null {
  const block = blockAt(state.doc, pos)
  if (!block) return null
  const after = block.pos + block.node.nodeSize
  const tr = state.tr.insert(after, block.node.copy(block.node.content))
  return tr.setSelection(NodeSelection.create(tr.doc, after)).scrollIntoView()
}

/** The block removed; the page keeps one empty paragraph when it was the last one. */
export function deleteBlock(state: EditorState, pos: number): Transaction | null {
  const block = blockAt(state.doc, pos)
  return block ? state.tr.delete(block.pos, block.pos + block.node.nodeSize).scrollIntoView() : null
}
