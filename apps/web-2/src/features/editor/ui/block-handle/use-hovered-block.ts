import type { Editor } from '@tiptap/core'
import { useEffect, useEffectEvent, useState } from 'react'

import { findBlock, type HoveredBlock } from './find-block'

/**
 * The block beside the pointer while it moves over the sheet. Typing hides the handle until the pointer moves again;
 * while `held` (its menu is open) the handle stays on its block.
 */
export function useHoveredBlock(editor: Editor, sheet: HTMLElement | null, held: boolean) {
  const [hovered, setHovered] = useState<HoveredBlock | null>(null)
  const move = useEffectEvent((event: MouseEvent) => {
    if (held || !sheet) return
    // On the handle itself: keep the block it belongs to.
    if (event.target instanceof Element && event.target.closest('[data-block-handle]')) return
    setHovered(findBlock(editor, sheet, event.clientY))
  })
  const leave = useEffectEvent(() => {
    if (!held) setHovered(null)
  })
  useEffect(() => {
    const dom = editor.view.dom
    if (!sheet) return undefined
    sheet.addEventListener('mousemove', move)
    sheet.addEventListener('mouseleave', leave)
    dom.addEventListener('keydown', leave)
    return () => {
      sheet.removeEventListener('mousemove', move)
      sheet.removeEventListener('mouseleave', leave)
      dom.removeEventListener('keydown', leave)
    }
  }, [editor, sheet])
  return hovered
}
