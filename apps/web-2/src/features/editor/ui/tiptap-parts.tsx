import { EditorContent, NodeViewWrapper, type Editor } from '@tiptap/react'

import { AttrForm } from './nodes/attr-form'
import { FileUpload } from './nodes/file-upload'
import { MathTemplates } from './nodes/math-templates'
import { NodeParts, type Parts } from './nodes/parts'
import { PreviewOptions } from './nodes/preview-options'

import { TiptapContent } from './tiptap-content'

const TIPTAP_PARTS: Parts = {
  Wrapper: NodeViewWrapper,
  Content: TiptapContent,
  Authoring: { Upload: FileUpload, AttrForm, MathTemplates, PreviewOptions },
}

/** EditorContent with the block views built of Tiptap's own parts (node views render inside its portals). */
export function DocumentContent({ editor }: { editor: Editor | null }) {
  return (
    <NodeParts value={TIPTAP_PARTS}>
      <EditorContent editor={editor} />
    </NodeParts>
  )
}
