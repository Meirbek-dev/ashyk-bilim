import { m } from '#/paraglide/messages'
import { uploadAccept } from '#/shared/api/upload'
import { FileButton } from '#/shared/components/file-button'
import { useUpload } from '#/shared/hooks/use-upload'

import type { EditorDocument } from '../model/document'
import { ContentStyles } from './content-styles'
import { EditorToolbar } from './toolbar/editor-toolbar'
import { DocumentContent } from './tiptap-parts'
import { useDocumentEditor } from './use-document-editor'

type DiscussionEditorProps = {
  content: unknown
  onChange: (doc: EditorDocument) => void
  /** An image uploaded into the post (`discussion-image`): the post claims it with `upload_ids` when saved. */
  onImage: (image: { id: string; key: string }) => void
  /** Caret at the end once shown: editing a post moves focus here from its «Изменить» button. */
  focusOnMount?: boolean
}

/** A discussion post or reply: rich text, code, links and images (picked or pasted); embeds of old posts are kept. */
export function DiscussionEditor({ content, onChange, onImage, focusOnMount = false }: DiscussionEditorProps) {
  const upload = useUpload('discussion-image')
  const insert = async (file: File) => {
    const done = await upload.start(file)
    if (!done || !editor) return
    onImage(done)
    editor
      .chain()
      .focus()
      .setImage({ src: `/content/${done.key}` })
      .run()
  }
  const editor = useDocumentEditor({
    preset: 'discussion',
    content,
    onChange,
    onPasteImage: file => void insert(file),
    focusOnMount,
  })
  return (
    <div className="flex flex-col gap-2">
      <ContentStyles />
      {editor ? <EditorToolbar editor={editor} /> : null}
      <DocumentContent editor={editor} />
      <div className="flex flex-wrap items-center gap-2">
        <FileButton
          label={m.editor_image_add()}
          accept={uploadAccept('discussion-image')}
          onFile={file => void insert(file)}
          pending={upload.pending}
        />
        {upload.error ? <p className="text-sm text-destructive">{upload.error}</p> : null}
      </div>
    </div>
  )
}
