import { Placeholder } from '@tiptap/extensions'
import { Markdown } from '@tiptap/markdown'
import { EditorContent, useEditor } from '@tiptap/react'
import katexCss from 'katex/dist/katex.min.css?url'
import { useEffect } from 'react'

import { markdownSchema } from '../model/schema'
import { MarkdownToolbar } from './markdown-toolbar'
import proseCss from '#/styles/prose.css?url'

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
        class: 'ab-prose min-h-24 max-w-none px-3 py-2 outline-none',
      },
    },
  })
  useEffect(() => {
    if (editor && value !== editor.getMarkdown())
      editor.commands.setContent(value, { contentType: 'markdown', emitUpdate: false })
  }, [editor, value])
  return (
    // One control: the toolbar on the top edge of the field's own box, which takes the focus ring from the text inside.
    <div className="rounded-md border border-input bg-background transition-colors duration-150 has-[.ProseMirror:focus-visible]:border-ring has-[.ProseMirror:focus-visible]:ring-3 has-[.ProseMirror:focus-visible]:ring-ring/50 [&_[role=toolbar]]:gap-0.5 [&_[role=toolbar]]:border-b [&_[role=toolbar]]:p-1 [&_[role=toolbar]_button]:size-7">
      <link rel="stylesheet" href={proseCss} precedence="ab-prose" />
      {/* Mathematics renders formulas with KaTeX inside the editor: without its stylesheet both copies show. */}
      <link rel="stylesheet" href={katexCss} precedence="ab-katex" />
      {editor ? <MarkdownToolbar editor={editor} /> : null}
      <EditorContent editor={editor} />
    </div>
  )
}
