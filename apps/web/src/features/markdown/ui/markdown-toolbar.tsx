import type { Editor } from '@tiptap/core'
import { useEditorState } from '@tiptap/react'
import { Bold, Code, Heading2, Italic, List, ListOrdered, Quote, Redo2, SquareCode, Undo2 } from 'lucide-react'

import { m } from '#/paraglide/messages'
import { IconButton } from '#/shared/components/icon-button'

const marks = [
  {
    name: 'bold',
    label: m.markdown_bold,
    Icon: Bold,
    run: (editor: Editor) => editor.chain().focus().toggleBold().run(),
  },
  {
    name: 'italic',
    label: m.markdown_italic,
    Icon: Italic,
    run: (editor: Editor) => editor.chain().focus().toggleItalic().run(),
  },
  {
    name: 'code',
    label: m.markdown_code,
    Icon: Code,
    run: (editor: Editor) => editor.chain().focus().toggleCode().run(),
  },
  {
    name: 'heading',
    label: m.markdown_heading,
    Icon: Heading2,
    run: (editor: Editor) => editor.chain().focus().toggleHeading({ level: 2 }).run(),
  },
  {
    name: 'bulletList',
    label: m.markdown_bullet_list,
    Icon: List,
    run: (editor: Editor) => editor.chain().focus().toggleBulletList().run(),
  },
  {
    name: 'orderedList',
    label: m.markdown_ordered_list,
    Icon: ListOrdered,
    run: (editor: Editor) => editor.chain().focus().toggleOrderedList().run(),
  },
  {
    name: 'blockquote',
    label: m.markdown_quote,
    Icon: Quote,
    run: (editor: Editor) => editor.chain().focus().toggleBlockquote().run(),
  },
  {
    name: 'codeBlock',
    label: m.markdown_code_block,
    Icon: SquareCode,
    run: (editor: Editor) => editor.chain().focus().toggleCodeBlock().run(),
  },
]

/** The markdown editor's formatting row; pressed buttons show the formatting under the cursor. */
export function MarkdownToolbar({ editor }: { editor: Editor }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      active: marks.map(mark => current.isActive(mark.name)),
      undo: current.can().undo(),
      redo: current.can().redo(),
    }),
  })
  return (
    <div
      role="toolbar"
      aria-label={m.markdown_toolbar()}
      className="flex flex-wrap gap-1 *:aria-pressed:bg-accent *:aria-pressed:text-accent-foreground"
    >
      {marks.map((mark, index) => (
        <IconButton
          key={mark.name}
          label={mark.label()}
          icon={<mark.Icon aria-hidden />}
          aria-pressed={state.active[index] === true}
          onClick={() => mark.run(editor)}
        />
      ))}
      <IconButton
        label={m.markdown_undo()}
        icon={<Undo2 aria-hidden />}
        disabled={!state.undo}
        onClick={() => editor.chain().focus().undo().run()}
      />
      <IconButton
        label={m.markdown_redo()}
        icon={<Redo2 aria-hidden />}
        disabled={!state.redo}
        onClick={() => editor.chain().focus().redo().run()}
      />
    </div>
  )
}
