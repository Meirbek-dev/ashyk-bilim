import type { Editor, JSONContent } from '@tiptap/core'
import type { EditorView } from '@tiptap/pm/view'
import {
  Calculator,
  CircleUser,
  Code2,
  FileText,
  FlipHorizontal2,
  Image,
  Info,
  Link,
  Minus,
  MousePointerClick,
  Table,
  Tag,
  TriangleAlert,
  Video,
  type LucideIcon,
} from 'lucide-react'

import { m } from '#/paraglide/messages'

const node = (content: JSONContent) => (editor: Editor) => editor.chain().focus().insertContent(content).run()

export type InsertItem = { value: string; label: () => string; Icon: LucideIcon; insert: (editor: Editor) => boolean }

/**
 * Blocks the "/" menu adds, each as an empty node of the stored schema. Atom blocks open their own form (file,
 * URL, formula, question) while empty.
 */
export const INSERT_ITEMS: readonly InsertItem[] = [
  { value: 'image', label: m.editor_block_image, Icon: Image, insert: node({ type: 'blockImage' }) },
  { value: 'video', label: m.editor_block_video, Icon: Video, insert: node({ type: 'blockVideo' }) },
  { value: 'pdf', label: m.editor_block_pdf, Icon: FileText, insert: node({ type: 'blockPDF' }) },
  {
    value: 'calloutInfo',
    label: m.editor_block_callout_info,
    Icon: Info,
    insert: node({ type: 'calloutInfo', content: [{ type: 'paragraph' }] }),
  },
  {
    value: 'calloutWarning',
    label: m.editor_block_callout_warning,
    Icon: TriangleAlert,
    insert: node({ type: 'calloutWarning', content: [{ type: 'paragraph' }] }),
  },
  {
    value: 'badge',
    label: m.editor_block_badge,
    Icon: Tag,
    insert: node({ type: 'badge', content: [{ type: 'paragraph' }] }),
  },
  { value: 'button', label: m.editor_block_button, Icon: MousePointerClick, insert: node({ type: 'button' }) },
  { value: 'embed', label: m.editor_block_embed, Icon: Code2, insert: node({ type: 'embedBlock' }) },
  { value: 'flipcard', label: m.editor_block_flipcard, Icon: FlipHorizontal2, insert: node({ type: 'flipcard' }) },
  { value: 'math', label: m.editor_block_math, Icon: Calculator, insert: node({ type: 'blockMathEquation' }) },
  { value: 'user', label: m.editor_block_user, Icon: CircleUser, insert: node({ type: 'blockUser' }) },
  { value: 'webPreview', label: m.editor_block_web_preview, Icon: Link, insert: node({ type: 'blockWebPreview' }) },
  {
    value: 'table',
    label: m.editor_table,
    Icon: Table,
    insert: editor => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
  },
  {
    value: 'divider',
    label: m.editor_block_divider,
    Icon: Minus,
    insert: editor => editor.chain().focus().setHorizontalRule().run(),
  },
]

/** Where the insert menu opens: the toolbar button, or the caret (a rect). */
export type MenuAnchor = Element | { getBoundingClientRect: () => DOMRect }

/** "/" typed in an empty paragraph opens the insert menu at the caret instead of typing the slash. */
export function slashAnchor(view: EditorView, event: KeyboardEvent): MenuAnchor | null {
  const { $from, empty } = view.state.selection
  if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey || !empty) return null
  if ($from.parent.type.name !== 'paragraph' || $from.parent.content.size > 0) return null
  const caret = view.coordsAtPos($from.pos)
  return { getBoundingClientRect: () => new DOMRect(caret.left, caret.top, 0, caret.bottom - caret.top) }
}
