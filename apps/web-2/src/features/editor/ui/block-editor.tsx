import { useState, type ReactNode } from 'react'

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
  /** Printed above the text in the text's column, as the player prints the lesson's title. Not editable. */
  header?: ReactNode
}

/**
 * Authoring of a lesson page, on the paper the learner reads it on: the toolbar on its top edge, the page written at
 * the learner's width and in their type (`ab-prose`, at the player's column) with a handle beside each block (add, drag,
 * block menu), the "/" menu, a link bubble, file paste and drop, and a status bar (length, shortcuts) on its bottom edge.
 * No box: while the page has the keyboard, the rule under the toolbar takes the focus colour.
 */
export function BlockEditor({ activityId, content, onChange, header }: BlockEditorProps) {
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
        data-sheet
        className="relative flex flex-1 flex-col transition-colors [&>[role=toolbar]]:px-3 @3xl:[&>[role=toolbar]]:px-6 writing:[&>[role=toolbar]]:border-b-ring writing:[&>[role=toolbar]]:shadow-[0_1px_0_0_var(--ring)]"
      >
        <ContentStyles />
        {editor ? <EditorToolbar editor={editor} onLink={() => setLinking(true)} onInsert={setMenu} /> : null}
        {header ? <div className="mx-auto w-full max-w-[42rem] px-4 pt-10">{header}</div> : null}
        <DocumentContent editor={editor} className="flex flex-1 flex-col" />
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
