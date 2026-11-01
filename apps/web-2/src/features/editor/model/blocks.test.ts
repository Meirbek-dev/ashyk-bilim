import { getSchema } from '@tiptap/core'
import { EditorState, NodeSelection, TextSelection } from '@tiptap/pm/state'
import { describe, expect, test } from 'vite-plus/test'

import { blockAt, deleteBlock, duplicateBlock, moveBlock } from './blocks'
import { contentSchema } from './schema'

const schema = getSchema(contentSchema())
const paragraph = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] })
const page = (...texts: string[]) =>
  EditorState.create({ schema, doc: schema.nodeFromJSON({ type: 'doc', content: texts.map(paragraph) }) })
const texts = (state: EditorState) => state.doc.children.map(node => node.textContent)
/** Where the n-th top-level block starts. */
const start = (state: EditorState, index: number) =>
  state.doc.children.slice(0, index).reduce((pos, node) => pos + node.nodeSize, 0)

describe('blocks', () => {
  test('B-EDT-36 a block moves up and down past its neighbour; the caret moves with it', () => {
    const state = page('one', 'two', 'three')
    const caret = state.apply(state.tr.setSelection(TextSelection.create(state.doc, start(state, 1) + 2)))
    const up = moveBlock(caret, caret.selection.from, -1)
    if (!up) throw new Error('no move')
    const moved = caret.apply(up)
    expect(texts(moved)).toEqual(['two', 'one', 'three'])
    expect(moved.selection.$from.parent.textContent).toBe('two')
    expect(moved.selection.from).toBe(2)
    const down = moveBlock(state, start(state, 0), 1)
    expect(down && texts(state.apply(down))).toEqual(['two', 'one', 'three'])
  })

  test('B-EDT-36 the first block does not move up nor the last one down', () => {
    const state = page('one', 'two')
    expect(moveBlock(state, start(state, 0), -1)).toBeNull()
    expect(moveBlock(state, start(state, 1), 1)).toBeNull()
  })

  test('B-EDT-36 a block moved from the handle ends up selected', () => {
    const state = page('one', 'two', 'three')
    const tr = moveBlock(state, start(state, 2), -1)
    const moved = tr ? state.apply(tr) : state
    expect(texts(moved)).toEqual(['one', 'three', 'two'])
    expect(moved.selection).toBeInstanceOf(NodeSelection)
    expect(moved.selection.from).toBe(start(moved, 1))
  })

  test('B-EDT-36 duplicate puts a selected copy right after; delete keeps one empty paragraph', () => {
    const state = page('one', 'two')
    const tr = duplicateBlock(state, start(state, 0))
    const copied = tr ? state.apply(tr) : state
    expect(texts(copied)).toEqual(['one', 'one', 'two'])
    expect(copied.selection.from).toBe(start(copied, 1))
    const single = page('only')
    const removed = deleteBlock(single, 0)
    const after = removed ? single.apply(removed) : single
    expect(after.doc.childCount).toBe(1)
    expect(after.doc.firstChild?.type.name).toBe('paragraph')
    expect(after.doc.textContent).toBe('')
  })

  test('B-EDT-36 the block at a position is the top-level one that holds it', () => {
    const state = page('one', 'two')
    expect(blockAt(state.doc, 1)?.node.textContent).toBe('one')
    expect(blockAt(state.doc, start(state, 1))?.node.textContent).toBe('two')
    expect(blockAt(state.doc, -1)).toBeNull()
  })
})
