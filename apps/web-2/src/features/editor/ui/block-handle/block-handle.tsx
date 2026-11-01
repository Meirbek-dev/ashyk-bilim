import type { Editor } from '@tiptap/core'
import { Plus } from 'lucide-react'
import { useState, type CSSProperties } from 'react'

import { m } from '#/paraglide/messages'

import { blockAt } from '../../model/blocks'
import type { MenuAnchor } from '../toolbar/insert-items'
import { ToolButton } from '../toolbar/tool-button'
import { BlockMenu } from './block-menu'
import { useHoveredBlock } from './use-hovered-block'

type BlockHandleProps = {
  editor: Editor
  /** The sheet the handle is positioned in (relative). */
  sheet: HTMLElement | null
  /** Opens the insert menu at a caret (the same menu as "/"). */
  onInsert: (anchor: MenuAnchor) => void
}

type Place = CSSProperties & Record<'--handle-top' | '--handle-left', string>

/** A new empty line under the block (or the block itself when it is one) with the caret in it, and the insert menu. */
function addBelow(editor: Editor, pos: number, onInsert: (anchor: MenuAnchor) => void) {
  const block = blockAt(editor.state.doc, pos)
  if (!block) return
  const empty = block.node.type.name === 'paragraph' && block.node.content.size === 0
  const caret = empty ? pos + 1 : pos + block.node.nodeSize + 1
  const chain = editor.chain().focus()
  if (!empty) chain.insertContentAt(pos + block.node.nodeSize, { type: 'paragraph' })
  chain.setTextSelection(caret).run()
  const at = editor.view.coordsAtPos(caret)
  onInsert({ getBoundingClientRect: () => new DOMRect(at.left, at.top, 0, at.bottom - at.top) })
}

/**
 * Left of the block under the pointer: "+" adds a block below it (through the insert menu), the grip drags it or
 * opens its menu. For a mouse only (`pointer: fine`): touch and keyboard writers have "/", the toolbar and the keys.
 */
export function BlockHandle({ editor, sheet, onInsert }: BlockHandleProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const hovered = useHoveredBlock(editor, sheet, menuOpen)
  if (!hovered || !editor.isEditable) return null
  return (
    <div
      data-block-handle
      className="absolute top-(--handle-top) left-(--handle-left) z-10 hidden items-center text-muted-foreground pointer-fine:flex"
      style={{ '--handle-top': `${hovered.top}px`, '--handle-left': `${hovered.left}px` } as Place}
    >
      <ToolButton
        size="icon-xs"
        label={m.editor_block_add()}
        icon={<Plus aria-hidden />}
        onClick={() => addBelow(editor, hovered.pos, onInsert)}
      />
      <BlockMenu editor={editor} pos={hovered.pos} onOpenChange={setMenuOpen} />
    </div>
  )
}
