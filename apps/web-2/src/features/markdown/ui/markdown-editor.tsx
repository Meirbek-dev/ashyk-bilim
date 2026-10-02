import { Placeholder } from '@tiptap/extensions'
import { Markdown } from '@tiptap/markdown'
import { EditorContent, useEditor } from '@tiptap/react'
import { useEffect } from 'react'

import { markdownSchema } from '../model/schema'
import { MarkdownToolbar } from './markdown-toolbar'
import proseCss from './prose.css?url'

type MarkdownEditorProps = {
  value: string
  onChange: (markdown: string) => void
  /** The accessible name of the text area (the field's label). */
  label: string
  placeholder?: string
}

/**
 * WYSIWYG editing of a markdown string on the Tiptap core: markdown in, markdown out (@tiptap/markdown).
 * What it saves renders the same in MarkdownView (G-14 round trip).
 */
export function MarkdownEditor({ value, onChange, label, placeholder = '' }: MarkdownEditorProps) {
  const editor = useEditor({
    extensions: [...markdownSchema(), Markdown, Placeholder.configure({ placeholder })],
    content: value,
    contentType: 'markdown',
    immediatelyRender: false,
    onUpdate: ({ editor: current }) => onChange(current.getMarkdown()),
    editorProps: {
      attributes: {
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': label,
        class: 'ab-prose min-h-24 max-w-none rounded-md border border-input bg-background px-3 py-2',
      },
    },
  })
  useEffect(() => {
    if (editor && value !== editor.getMarkdown())
      editor.commands.setContent(value, { contentType: 'markdown', emitUpdate: false })
  }, [editor, value])
  return (
    <div className="flex flex-col gap-2">
      <link rel="stylesheet" href={proseCss} precedence="ab-prose" />
      {editor ? <MarkdownToolbar editor={editor} /> : null}
      <EditorContent editor={editor} />
    </div>
  )
}
