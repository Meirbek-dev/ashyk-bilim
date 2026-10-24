import { createContext, type ComponentType } from 'react'

import { StaticContent } from '../static/content'
import { StaticWrapper, type PartProps } from '../static/wrapper'

import type { AttrForm } from './attr-form'
import type { MathTemplates } from './math-templates'
import type { PreviewOptions } from './preview-options'

/**
 * What a block view reads of its node. Tiptap's ReactNodeViewProps fit it; the static viewer passes a plain object,
 * so a read-only page renders the same views without loading Tiptap.
 */
export type ViewProps = {
  node: { attrs: Record<string, unknown>; type: { name: string } }
  editor: { isEditable: boolean }
  selected: boolean
  updateAttributes: (attributes: Record<string, unknown>) => void
}

export type { PartProps } from '../static/wrapper'

/**
 * The elements a block view is built of. The editor provides Tiptap's NodeViewWrapper / NodeViewContent and the
 * authoring controls (TIPTAP_PARTS in tiptap-parts.tsx); the default is their static twins with the same DOM and no
 * authoring, so a page read without the editor looks the same to the pixel and loads no form code (B-EDT-34).
 */
export type Parts = {
  Wrapper: ComponentType<PartProps>
  Content: ComponentType<PartProps>
  Authoring: {
    Upload: ComponentType<ViewProps>
    AttrForm: typeof AttrForm
    MathTemplates: typeof MathTemplates
    PreviewOptions: typeof PreviewOptions
  } | null
}

export const NodeParts = createContext<Parts>({ Wrapper: StaticWrapper, Content: StaticContent, Authoring: null })
