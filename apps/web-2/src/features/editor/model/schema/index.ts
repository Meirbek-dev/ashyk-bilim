import { Extension, type AnyExtension } from '@tiptap/core'
import { Image } from '@tiptap/extension-image'
import { TableKit } from '@tiptap/extension-table'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { StarterKit } from '@tiptap/starter-kit'

import { headingIdUpdates } from '../heading-ids'
import {
  Badge,
  ButtonBlock,
  CalloutInfo,
  CalloutWarning,
  Flipcard,
  ImageBlock,
  MathBlock,
  PdfBlock,
  Scenarios,
  UserBlock,
  VideoBlock,
  WebPreview,
} from './blocks'
import { EmbedBlock } from './embed-block'

const allowedLink = (url: string) => {
  try {
    return ['http:', 'https:'].includes(new URL(url, 'https://relative.invalid').protocol)
  } catch {
    return false
  }
}

/** Headings carry a unique `id` (outline and `#anchor` links), kept in sync on every change. */
const HeadingIds = Extension.create({
  name: 'headingIds',
  addGlobalAttributes: () => [
    {
      types: ['heading'],
      attributes: {
        id: {
          default: null,
          parseHTML: element => element.getAttribute('id'),
          renderHTML: attributes => (attributes['id'] ? { id: attributes['id'] } : {}),
        },
      },
    },
  ],
  addProseMirrorPlugins: () => [
    new Plugin({
      key: new PluginKey('headingIds'),
      appendTransaction: (_transactions, _old, state) => {
        const headings: { pos: number; id: unknown; text: string }[] = []
        state.doc.descendants((node, pos) => {
          if (node.type.name === 'heading') headings.push({ pos, id: node.attrs['id'], text: node.textContent })
        })
        const updates = headingIdUpdates(headings)
        if (updates.length === 0) return null
        const { tr } = state
        for (const { pos, id } of updates) tr.setNodeAttribute(pos, 'id', id)
        return tr
      },
    }),
  ],
})

const starterKit = () =>
  StarterKit.configure({
    link: {
      openOnClick: false,
      autolink: true,
      defaultProtocol: 'https',
      protocols: ['http', 'https'],
      isAllowedUri: (url, context) => context.defaultValidate(url) && allowedLink(url),
      HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer' },
    },
  })

/** The schema of lesson pages (`activities.content`): authoring and view presets. */
export const contentSchema = (): AnyExtension[] => [
  starterKit(),
  HeadingIds,
  TableKit,
  CalloutInfo,
  CalloutWarning,
  Badge,
  ButtonBlock,
  EmbedBlock,
  Flipcard,
  ImageBlock,
  MathBlock,
  PdfBlock,
  Scenarios,
  UserBlock,
  VideoBlock,
  WebPreview,
]

/** The schema of discussion posts (`course_discussions.content`): rich text, images and embeds. */
export const discussionSchema = (): AnyExtension[] => [starterKit(), HeadingIds, Image, EmbedBlock]
