import { Node, type AnyExtension } from '@tiptap/core'
import { Placeholder } from '@tiptap/extensions'
import { ReactNodeViewRenderer } from '@tiptap/react'

import { m } from '#/paraglide/messages'

import { contentSchema, discussionSchema } from '../model/schema'
import { CodeHighlight } from './code-highlight'
import { FileDrop } from './file-drop'
import { DISCUSSION_VIEWS, VIEWS, type BlockView } from './views'

export type Preset = 'authoring' | 'view' | 'discussion' | 'discussion-view'

/** The schema's nodes with their React views attached (the schema itself stays DOM-free in model/). */
const withViews = (extensions: AnyExtension[], views: Record<string, BlockView>): AnyExtension[] =>
  extensions.map(extension => {
    const view = views[extension.name]
    if (!view || !(extension instanceof Node)) return extension
    const [component, contentDOMElementTag = 'div'] = view
    return extension.extend({ addNodeView: () => ReactNodeViewRenderer(component, { contentDOMElementTag }) })
  })

/**
 * One Tiptap core, four presets: authoring and view (lesson pages), discussion and discussion-view (posts). A view
 * preset renders only what its surface's editor can author (its schema and views).
 */
export function presetExtensions(preset: Preset): AnyExtension[] {
  const placeholder = Placeholder.configure({ placeholder: () => m.editor_placeholder() })
  const presets: Record<Preset, () => AnyExtension[]> = {
    authoring: () => [...withViews(contentSchema(), VIEWS), CodeHighlight, FileDrop, placeholder],
    view: () => [...withViews(contentSchema(), VIEWS), CodeHighlight],
    discussion: () => [...withViews(discussionSchema(), DISCUSSION_VIEWS), CodeHighlight, placeholder],
    'discussion-view': () => [...withViews(discussionSchema(), DISCUSSION_VIEWS), CodeHighlight],
  }
  return presets[preset]()
}
