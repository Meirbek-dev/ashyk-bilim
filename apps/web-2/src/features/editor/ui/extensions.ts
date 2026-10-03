import { Node, type AnyExtension } from '@tiptap/core'
import { Placeholder } from '@tiptap/extensions'
import { ReactNodeViewRenderer, type ReactNodeViewProps } from '@tiptap/react'
import type { ComponentType } from 'react'

import { m } from '#/paraglide/messages'

import { contentSchema, discussionSchema } from '../model/schema'
import { CodeHighlight } from './code-highlight'
import { FileDrop } from './file-drop'
import { BadgeView } from './nodes/badge-view'
import { ButtonView } from './nodes/button-view'
import { CalloutView } from './nodes/callout-view'
import { EmbedView } from './nodes/embed-view'
import { FileView } from './nodes/file-views'
import { FlipcardView } from './nodes/flipcard-view'
import { MathView } from './nodes/math-view'
import { ScenariosView } from './nodes/scenarios-view'
import { UserView } from './nodes/user-view'
import { WebPreviewView } from './nodes/web-preview-view'

export type Preset = 'authoring' | 'view' | 'discussion'

const VIEWS: Record<string, [ComponentType<ReactNodeViewProps>, ('div' | 'span')?]> = {
  calloutInfo: [CalloutView],
  calloutWarning: [CalloutView],
  badge: [BadgeView],
  button: [ButtonView, 'span'],
  embedBlock: [EmbedView],
  flipcard: [FlipcardView],
  blockImage: [FileView],
  blockPDF: [FileView],
  blockVideo: [FileView],
  blockMathEquation: [MathView],
  scenarios: [ScenariosView],
  blockUser: [UserView],
  blockWebPreview: [WebPreviewView],
}

/** The schema's nodes with their React views attached (the schema itself stays DOM-free in model/). */
const withViews = (extensions: AnyExtension[]): AnyExtension[] =>
  extensions.map(extension => {
    const view = VIEWS[extension.name]
    if (!view || !(extension instanceof Node)) return extension
    const [component, contentDOMElementTag = 'div'] = view
    return extension.extend({ addNodeView: () => ReactNodeViewRenderer(component, { contentDOMElementTag }) })
  })

/** One Tiptap core, three presets: authoring (lesson pages), view (read-only, interactive blocks), discussion. */
export function presetExtensions(preset: Preset): AnyExtension[] {
  const placeholder = Placeholder.configure({ placeholder: () => m.editor_placeholder() })
  const presets: Record<Preset, () => AnyExtension[]> = {
    authoring: () => [...withViews(contentSchema()), CodeHighlight, FileDrop, placeholder],
    view: () => [...withViews(contentSchema()), CodeHighlight],
    discussion: () => [...withViews(discussionSchema()), CodeHighlight, placeholder],
  }
  return presets[preset]()
}
