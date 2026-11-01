import type { Editor } from '@tiptap/core'

import { blockAt } from '../../model/blocks'

/** The block the pointer is beside, and where its handle goes in the sheet (px from the sheet's top left). */
export type HoveredBlock = { pos: number; top: number; left: number }

/** The handle's two buttons and the gap to the text: the room it needs left of the text column. */
const HANDLE_WIDTH = 56
const BUTTON = 24

/** The vertical middle of a block's first line, so the handle sits on the line, not on a tall block's middle. */
function firstLine(element: HTMLElement, rect: DOMRect) {
  const line = Number.parseFloat(getComputedStyle(element).lineHeight)
  return Number.isFinite(line) ? Math.min(line, rect.height) : Math.min(rect.height, BUTTON)
}

/**
 * The top-level block at the pointer's height: the pointer may be anywhere across the sheet, in the gutter too. Null
 * over no block, or when the sheet leaves no room for the handle left of the text (a narrow window).
 */
export function findBlock(editor: Editor, sheet: HTMLElement, clientY: number): HoveredBlock | null {
  const { view } = editor
  const column = view.dom.getBoundingClientRect()
  const textLeft = column.left + Number.parseFloat(getComputedStyle(view.dom).paddingLeft)
  const at = view.posAtCoords({ left: textLeft + 1, top: clientY })
  const block = at ? blockAt(view.state.doc, at.inside >= 0 ? at.inside : at.pos) : null
  const element = block ? view.nodeDOM(block.pos) : null
  if (!block || !(element instanceof HTMLElement)) return null
  const box = sheet.getBoundingClientRect()
  const rect = element.getBoundingClientRect()
  const left = textLeft - box.left - HANDLE_WIDTH
  if (left < 4) return null
  return { pos: block.pos, top: rect.top - box.top + (firstLine(element, rect) - BUTTON) / 2, left }
}
