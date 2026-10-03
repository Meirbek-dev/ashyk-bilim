import { EditorContent } from '@tiptap/react'
import { useState } from 'react'

import type { EditorDocument } from '../model/document'
import { ContentStyles } from './content-styles'
import { ActivityContext } from './file-drop'
import { EditorToolbar } from './toolbar/editor-toolbar'
import type { MenuAnchor } from './toolbar/insert-items'
import { InsertMenu } from './toolbar/insert-menu'
import { useDocumentEditor } from './use-document-editor'

type BlockEditorProps = {
  /** The activity whose page this is: image, PDF and video uploads are claimed for it (createBlock). */
  activityId: string
  /** Stored content as the API returns it (legacy shapes are read and saved canonical). */
  content: unknown
  /** Every change, as the canonical document to autosave. Pass it back as `content` unchanged. */
  onChange: (doc: EditorDocument) => void
}

/** Authoring of a lesson page: every block of the schema, the "/" menu, file paste and drop, the toolbar. */
export function BlockEditor({ activityId, content, onChange }: BlockEditorProps) {
  const [menu, setMenu] = useState<MenuAnchor | null>(null)
  const editor = useDocumentEditor({ preset: 'authoring', content, onChange, onSlash: setMenu })
  return (
    <ActivityContext value={activityId}>
      <div className="flex flex-col gap-2">
        <ContentStyles />
        {editor ? <EditorToolbar editor={editor} onInsert={setMenu} /> : null}
        <EditorContent editor={editor} />
        {editor ? <InsertMenu editor={editor} anchor={menu} onClose={() => setMenu(null)} /> : null}
      </div>
    </ActivityContext>
  )
}
