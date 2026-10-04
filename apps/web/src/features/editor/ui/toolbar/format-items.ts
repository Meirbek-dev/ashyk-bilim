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

export type FormatItem = { name: string; label: () => string; Icon: LucideIcon; run: (editor: Editor) => boolean }

const chain = (editor: Editor) => editor.chain().focus()

/** Toggle buttons of the formatting toolbar; `name` is also what `editor.isActive` checks. */
export const FORMAT_ITEMS: readonly FormatItem[] = [
  { name: 'bold', label: m.editor_bold, Icon: Bold, run: editor => chain(editor).toggleBold().run() },
  { name: 'italic', label: m.editor_italic, Icon: Italic, run: editor => chain(editor).toggleItalic().run() },
  {
    name: 'underline',
    label: m.editor_underline,
    Icon: Underline,
    run: editor => chain(editor).toggleUnderline().run(),
  },
  { name: 'strike', label: m.editor_strike, Icon: Strikethrough, run: editor => chain(editor).toggleStrike().run() },
  { name: 'code', label: m.editor_code, Icon: Code, run: editor => chain(editor).toggleCode().run() },
  {
    name: 'bulletList',
    label: m.editor_bullet_list,
    Icon: List,
    run: editor => chain(editor).toggleBulletList().run(),
  },
  {
    name: 'orderedList',
    label: m.editor_ordered_list,
    Icon: ListOrdered,
    run: editor => chain(editor).toggleOrderedList().run(),
  },
  { name: 'blockquote', label: m.editor_quote, Icon: Quote, run: editor => chain(editor).toggleBlockquote().run() },
  {
    name: 'codeBlock',
    label: m.editor_code_block,
    Icon: SquareCode,
    run: editor => chain(editor).toggleCodeBlock().run(),
  },
]
