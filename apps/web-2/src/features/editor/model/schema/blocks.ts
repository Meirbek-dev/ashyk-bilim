import { mergeAttributes, Node } from '@tiptap/core'

import { BLOCK_ATTRS } from './attrs'

/**
 * The custom block nodes of the stored document, ported from apps/web/src/components/Objects/Editor/Extensions
 * with the same names, tags, content expressions and attribute defaults (the JSON contract, D-01 aside).
 * Node views are attached in ui/ (`withViews`); these definitions are DOM-free so the schema runs in Node.
 */
type BlockSpec = {
  name: string
  tag: string
  /** Absent: an atom (no editable content). */
  content?: string
  draggable?: boolean
  selectable?: boolean
  attrs: Record<string, unknown>
}

function block({ name, tag, content, draggable = false, selectable = true, attrs }: BlockSpec) {
  return Node.create({
    name,
    group: 'block',
    ...(content ? { content } : { atom: true }),
    draggable,
    selectable,
    addAttributes: () => Object.fromEntries(Object.entries(attrs).map(([key, value]) => [key, { default: value }])),
    parseHTML: () => [{ tag }],
    renderHTML: ({ HTMLAttributes }) =>
      content ? [tag, mergeAttributes(HTMLAttributes), 0] : [tag, mergeAttributes(HTMLAttributes)],
  })
}

export const CalloutInfo = block({
  name: 'calloutInfo',
  tag: 'callout-info',
  content: 'block+',
  draggable: true,
  attrs: BLOCK_ATTRS.calloutInfo,
})

export const CalloutWarning = block({
  name: 'calloutWarning',
  tag: 'callout-warning',
  content: 'block+',
  draggable: true,
  attrs: BLOCK_ATTRS.calloutWarning,
})

export const Badge = block({
  name: 'badge',
  tag: 'badge',
  content: 'block+',
  draggable: true,
  attrs: BLOCK_ATTRS.badge,
})

export const ButtonBlock = block({
  name: 'button',
  tag: 'button-block',
  content: 'text*',
  draggable: true,
  attrs: BLOCK_ATTRS.button,
})

export const Flipcard = block({
  name: 'flipcard',
  tag: 'flipcard-block',
  content: 'text*',
  selectable: false,
  attrs: BLOCK_ATTRS.flipcard,
})

export const ImageBlock = block({
  name: 'blockImage',
  tag: 'block-image',
  attrs: BLOCK_ATTRS.blockImage,
})

export const PdfBlock = block({
  name: 'blockPDF',
  tag: 'block-pdf',
  attrs: BLOCK_ATTRS.blockPDF,
})

export const VideoBlock = block({ name: 'blockVideo', tag: 'block-video', attrs: BLOCK_ATTRS.blockVideo })

export const MathBlock = block({
  name: 'blockMathEquation',
  tag: 'block-math-equation',
  attrs: BLOCK_ATTRS.blockMathEquation,
})

export const Scenarios = block({
  name: 'scenarios',
  tag: 'scenarios-block',
  draggable: true,
  attrs: BLOCK_ATTRS.scenarios,
})

export const UserBlock = block({ name: 'blockUser', tag: 'block-user', attrs: BLOCK_ATTRS.blockUser })

export const WebPreview = block({
  name: 'blockWebPreview',
  tag: 'web-preview',
  attrs: BLOCK_ATTRS.blockWebPreview,
})
