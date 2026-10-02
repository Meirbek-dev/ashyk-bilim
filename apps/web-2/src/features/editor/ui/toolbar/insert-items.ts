import type { Editor, JSONContent } from '@tiptap/core'

import { m } from '#/paraglide/messages'

const node = (content: JSONContent) => (editor: Editor) => editor.chain().focus().insertContent(content).run()

/**
 * Blocks the Insert menu adds, each as an empty node of the stored schema. Atom blocks open their own
 * form (URL, formula, question) while empty. Image, PDF and video wait for the shared upload primitive.
 */
export const INSERT_ITEMS: readonly { label: () => string; insert: (editor: Editor) => boolean }[] = [
  { label: m.editor_block_callout_info, insert: node({ type: 'calloutInfo', content: [{ type: 'paragraph' }] }) },
  { label: m.editor_block_callout_warning, insert: node({ type: 'calloutWarning', content: [{ type: 'paragraph' }] }) },
  { label: m.editor_block_badge, insert: node({ type: 'badge', content: [{ type: 'paragraph' }] }) },
  { label: m.editor_block_button, insert: node({ type: 'button' }) },
  { label: m.editor_block_embed, insert: node({ type: 'embedBlock' }) },
  { label: m.editor_block_flipcard, insert: node({ type: 'flipcard' }) },
  { label: m.editor_block_math, insert: node({ type: 'blockMathEquation' }) },
  { label: m.editor_block_user, insert: node({ type: 'blockUser' }) },
  { label: m.editor_block_web_preview, insert: node({ type: 'blockWebPreview' }) },
  {
    label: m.editor_table,
    insert: editor => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
  },
  { label: m.editor_block_divider, insert: editor => editor.chain().focus().setHorizontalRule().run() },
]
