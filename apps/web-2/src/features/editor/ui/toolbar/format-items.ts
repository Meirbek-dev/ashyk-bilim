import type { Editor } from '@tiptap/core'
import {
  Bold,
  Code,
  Italic,
  List,
  ListOrdered,
  Quote,
  SquareCode,
  Strikethrough,
  Underline,
  type LucideIcon,
} from 'lucide-react'

import { m } from '#/paraglide/messages'

export type FormatItem = {
  name: string
  label: () => string
  Icon: LucideIcon
  /** Tiptap's own shortcut for it (shown in the tooltip and the shortcuts list). */
  keys: string
  run: (editor: Editor) => boolean
}

const chain = (editor: Editor) => editor.chain().focus()

/** Inline formatting toggles; `name` is also what `editor.isActive` checks. */
export const MARK_ITEMS: readonly FormatItem[] = [
  { name: 'bold', label: m.editor_bold, Icon: Bold, keys: 'Mod-b', run: editor => chain(editor).toggleBold().run() },
  {
    name: 'italic',
    label: m.editor_italic,
    Icon: Italic,
    keys: 'Mod-i',
    run: editor => chain(editor).toggleItalic().run(),
  },
  {
    name: 'underline',
    label: m.editor_underline,
    Icon: Underline,
    keys: 'Mod-u',
    run: editor => chain(editor).toggleUnderline().run(),
  },
  {
    name: 'strike',
    label: m.editor_strike,
    Icon: Strikethrough,
    keys: 'Mod-Shift-s',
    run: editor => chain(editor).toggleStrike().run(),
  },
  { name: 'code', label: m.editor_code, Icon: Code, keys: 'Mod-e', run: editor => chain(editor).toggleCode().run() },
]

/** Block toggles: lists, quote, code block. */
export const BLOCK_ITEMS: readonly FormatItem[] = [
  {
    name: 'bulletList',
    label: m.editor_bullet_list,
    Icon: List,
    keys: 'Mod-Shift-8',
    run: editor => chain(editor).toggleBulletList().run(),
  },
  {
    name: 'orderedList',
    label: m.editor_ordered_list,
    Icon: ListOrdered,
    keys: 'Mod-Shift-7',
    run: editor => chain(editor).toggleOrderedList().run(),
  },
  {
    name: 'blockquote',
    label: m.editor_quote,
    Icon: Quote,
    keys: 'Mod-Shift-b',
    run: editor => chain(editor).toggleBlockquote().run(),
  },
  {
    name: 'codeBlock',
    label: m.editor_code_block,
    Icon: SquareCode,
    keys: 'Mod-Alt-c',
    run: editor => chain(editor).toggleCodeBlock().run(),
  },
]
