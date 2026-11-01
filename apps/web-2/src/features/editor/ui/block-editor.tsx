import { useState } from 'react'

import type { EditorDocument } from '../model/document'
import { BlockHandle } from './block-handle/block-handle'
import { ContentStyles } from './content-styles'
import { ActivityContext } from './file-drop'
import { LinkBubble } from './link-bubble'
import { StatusBar } from './status-bar'
import { EditorToolbar } from './toolbar/editor-toolbar'
import type { MenuAnchor } from './toolbar/insert-items'
import { InsertMenu } from './toolbar/insert-menu'
import { LinkDialog } from './toolbar/link-dialog'
import { DocumentContent } from './tiptap-parts'
import { useDocumentEditor } from './use-document-editor'

type BlockEditorProps = {
  /** The activity whose page this is: image, PDF and video uploads are claimed for it (createBlock). */
  activityId: string
  /** Stored content as the API returns it (legacy shapes are read and saved canonical). */
  content: unknown
  /** Every change, as the canonical document to autosave. Pass it back as `content` unchanged. */
  onChange: (doc: EditorDocument) => void
}

/**
 * Authoring of a lesson page on one sheet: the toolbar on its top edge, the page written at the learner's width with a
 * handle beside each block (add, drag, block menu), the "/" menu, a link bubble, file paste and drop, and a status bar
 * (length, shortcuts) on its bottom edge.
 */
export function BlockEditor({ activityId, content, onChange }: BlockEditorProps) {
  const [menu, setMenu] = useState<MenuAnchor | null>(null)
  const [linking, setLinking] = useState(false)
  const [sheet, setSheet] = useState<HTMLDivElement | null>(null)
  const editor = useDocumentEditor({
    preset: 'authoring',
    content,
    onChange,
    onSlash: setMenu,
    onLinkKey: () => setLinking(true),
  })
  return (
    <ActivityContext value={activityId}>
      <div
        ref={setSheet}
        className="relative flex flex-col rounded-xl border bg-card text-card-foreground shadow-xs transition-shadow writing:border-ring writing:ring-3 writing:ring-ring/50 [&>[role=toolbar]]:rounded-t-xl [&>[role=toolbar]]:bg-card [&>[role=toolbar]]:px-2"
      >
        <ContentStyles />
        {editor ? <EditorToolbar editor={editor} onLink={() => setLinking(true)} onInsert={setMenu} /> : null}
        <DocumentContent editor={editor} />
        {editor ? (
          <>
            <BlockHandle editor={editor} sheet={sheet} onInsert={setMenu} />
            <LinkBubble editor={editor} onEdit={() => setLinking(true)} />
            <LinkDialog editor={editor} open={linking} onOpenChange={setLinking} />
            <InsertMenu editor={editor} anchor={menu} onClose={() => setMenu(null)} />
            <StatusBar editor={editor} />
          </>
        ) : null}
      </div>
    </ActivityContext>
  )
}
