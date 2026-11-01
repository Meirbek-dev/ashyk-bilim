import type { ChainedCommands } from '@tiptap/core'
import { Heading2, Heading3, List, ListOrdered, Pilcrow, Quote, type LucideIcon } from 'lucide-react'

import { m } from '#/paraglide/messages'

type TurnInto = {
  value: string
  label: () => string
  Icon: LucideIcon
  run: (chain: ChainedCommands) => ChainedCommands
}

/** What a paragraph or heading can become from its block menu (the text blocks of the "/" menu, plus plain text). */
export const TURN_INTO: readonly TurnInto[] = [
  { value: 'paragraph', label: m.editor_paragraph, Icon: Pilcrow, run: chain => chain.setParagraph() },
  {
    value: 'heading2',
    label: () => m.editor_heading({ level: 2 }),
    Icon: Heading2,
    run: chain => chain.setHeading({ level: 2 }),
  },
  {
    value: 'heading3',
    label: () => m.editor_heading({ level: 3 }),
    Icon: Heading3,
    run: chain => chain.setHeading({ level: 3 }),
  },
  { value: 'bulletList', label: m.editor_bullet_list, Icon: List, run: chain => chain.toggleBulletList() },
  { value: 'orderedList', label: m.editor_ordered_list, Icon: ListOrdered, run: chain => chain.toggleOrderedList() },
  { value: 'quote', label: m.editor_quote, Icon: Quote, run: chain => chain.toggleBlockquote() },
]
