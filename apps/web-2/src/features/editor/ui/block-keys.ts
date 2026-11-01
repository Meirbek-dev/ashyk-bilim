import { Extension } from '@tiptap/core'

import { moveBlock } from '../model/blocks'

/** Ctrl/⌘+Shift+↑/↓ moves the block under the caret past its neighbour (as in Notion); one undo step each. */
export const BlockKeys = Extension.create({
  name: 'blockKeys',
  addKeyboardShortcuts() {
    const move = (direction: -1 | 1) => () => {
      const tr = moveBlock(this.editor.state, this.editor.state.selection.from, direction)
      if (tr) this.editor.view.dispatch(tr)
      return tr !== null
    }
    return { 'Mod-Shift-ArrowUp': move(-1), 'Mod-Shift-ArrowDown': move(1) }
  },
})
