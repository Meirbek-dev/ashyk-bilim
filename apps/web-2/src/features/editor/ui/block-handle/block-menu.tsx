import type { Editor } from '@tiptap/core'
import { NodeSelection, type EditorState, type Transaction } from '@tiptap/pm/state'
import { ArrowDown, ArrowUp, Copy, GripVertical, Trash2 } from 'lucide-react'
import type { DragEvent } from 'react'

import { m } from '#/paraglide/messages'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '#/shared/ui/dropdown-menu'

import { blockAt, deleteBlock, duplicateBlock, moveBlock } from '../../model/blocks'
import { printedKeys } from '#/shared/lib/key-label'
import { ToolButton } from '../toolbar/tool-button'
import { TURN_INTO } from './turn-into'

type BlockMenuProps = { editor: Editor; pos: number; onOpenChange: (open: boolean) => void }

/** Drags the block: ProseMirror moves it where it is dropped (the drop cursor shows where). */
function startDrag(editor: Editor, pos: number, event: DragEvent<HTMLElement>) {
  const { view } = editor
  const selection = NodeSelection.create(view.state.doc, pos)
  view.dispatch(view.state.tr.setSelection(selection))
  // A move: ProseMirror deletes the selected block where it was once the drop lands.
  view.dragging = { slice: selection.content(), move: true }
  const element = view.nodeDOM(pos)
  if (element instanceof HTMLElement) event.dataTransfer.setDragImage(element, 0, 0)
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('text/plain', selection.node.textContent)
}

/**
 * The block's grip: drag to move it, click for its menu: turn a text block into another text block, duplicate, move
 * up or down (also Ctrl/⌘+Shift+arrows), delete. Each change is one undo step.
 */
export function BlockMenu({ editor, pos, onOpenChange }: BlockMenuProps) {
  const run = (change: (state: EditorState) => Transaction | null) => {
    const tr = change(editor.state)
    if (tr) editor.view.dispatch(tr)
    editor.commands.focus()
  }
  const block = blockAt(editor.state.doc, pos)
  const turnable = block?.node.type.name === 'paragraph' || block?.node.type.name === 'heading'
  return (
    <DropdownMenu onOpenChange={open => onOpenChange(open)}>
      <DropdownMenuTrigger
        render={
          <ToolButton
            size="icon-xs"
            label={m.editor_block_actions()}
            icon={<GripVertical aria-hidden />}
            draggable
            onDragStart={event => startDrag(editor, pos, event)}
          />
        }
      />
      <DropdownMenuContent align="start" className="w-60">
        {turnable ? (
          <>
            <DropdownMenuGroup>
              <DropdownMenuLabel>{m.editor_turn_into()}</DropdownMenuLabel>
              {TURN_INTO.map(item => (
                <DropdownMenuItem
                  key={item.value}
                  onClick={() =>
                    item
                      .run(
                        editor
                          .chain()
                          .focus()
                          .setTextSelection(pos + 1),
                      )
                      .run()
                  }
                >
                  <item.Icon aria-hidden />
                  {item.label()}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
          </>
        ) : null}
        <DropdownMenuItem onClick={() => run(state => duplicateBlock(state, pos))}>
          <Copy aria-hidden />
          {m.editor_block_duplicate()}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => run(state => moveBlock(state, pos, -1))}>
          <ArrowUp aria-hidden />
          {m.editor_block_move_up()}
          <DropdownMenuShortcut aria-hidden>{printedKeys('Mod-Shift-ArrowUp')}</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => run(state => moveBlock(state, pos, 1))}>
          <ArrowDown aria-hidden />
          {m.editor_block_move_down()}
          <DropdownMenuShortcut aria-hidden>{printedKeys('Mod-Shift-ArrowDown')}</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => run(state => deleteBlock(state, pos))}>
          <Trash2 aria-hidden />
          {m.editor_block_delete()}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
