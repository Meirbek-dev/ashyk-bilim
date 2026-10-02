import { mergeAttributes, Node } from '@tiptap/core'

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
  attrs: {},
})

export const CalloutWarning = block({
  name: 'calloutWarning',
  tag: 'callout-warning',
  content: 'block+',
  draggable: true,
  attrs: {},
})

export const Badge = block({
  name: 'badge',
  tag: 'badge',
  content: 'block+',
  draggable: true,
  attrs: { color: 'sky', emoji: '💡' },
})

export const ButtonBlock = block({
  name: 'button',
  tag: 'button-block',
  content: 'text*',
  draggable: true,
  attrs: { emoji: '🔗', link: '', color: 'blue', alignment: 'left' },
})

export const Flipcard = block({
  name: 'flipcard',
  tag: 'flipcard-block',
  content: 'text*',
  selectable: false,
  attrs: { question: '', answer: '', color: 'blue', alignment: 'center', size: 'medium' },
})

export const ImageBlock = block({
  name: 'blockImage',
  tag: 'block-image',
  attrs: { blockObject: null, size: { width: 300 }, alignment: 'center' },
})

export const PdfBlock = block({
  name: 'blockPDF',
  tag: 'block-pdf',
  attrs: { blockObject: null, size: { width: 720, height: 540 } },
})

export const VideoBlock = block({ name: 'blockVideo', tag: 'block-video', attrs: { blockObject: null } })

export const MathBlock = block({
  name: 'blockMathEquation',
  tag: 'block-math-equation',
  attrs: { math_equation: '', html: '' },
})

export const Scenarios = block({
  name: 'scenarios',
  tag: 'scenarios-block',
  draggable: true,
  attrs: { title: '', scenarios: [], currentScenarioId: '1' },
})

export const UserBlock = block({ name: 'blockUser', tag: 'block-user', attrs: { user_id: '' } })

export const WebPreview = block({
  name: 'blockWebPreview',
  tag: 'web-preview',
  attrs: {
    url: null,
    title: null,
    description: null,
    og_image: null,
    favicon: null,
    og_type: null,
    og_url: null,
    site_name: null,
    alignment: 'left',
    buttonLabel: '',
    showButton: false,
    openInPopup: false,
  },
})
