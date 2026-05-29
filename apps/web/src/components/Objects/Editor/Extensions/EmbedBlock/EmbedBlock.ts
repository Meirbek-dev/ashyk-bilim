import { Node, mergeAttributes } from '@tiptap/core'
import type { CommandProps } from '@tiptap/core'
import { nodeView } from '@components/Objects/Editor/core/nodeview-types'
import EmbedBlockNodeView from './EmbedBlockNodeView'
import type { EmbedType } from './embed-options'

export interface EmbedBlockAttrs {
  type: EmbedType | null
  url: string | null
  width: string
  height: number
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    embedBlock: {
      insertEmbedBlock: (attrs?: Partial<EmbedBlockAttrs>) => ReturnType
      updateEmbedBlock: (pos: number, attrs: Partial<EmbedBlockAttrs>) => ReturnType
    }
  }
}

export const EmbedBlock = Node.create({
  name: 'embedBlock',
  group: 'block',
  atom: true,
  defining: true,
  isolating: true,
  draggable: true,

  addAttributes() {
    return {
      type: {
        default: null,
        parseHTML: element => element.getAttribute('data-embed-type') as EmbedType | null,
        renderHTML: attributes => {
          if (!attributes.type) return {}
          return { 'data-embed-type': attributes.type }
        },
      },
      url: {
        default: null,
        parseHTML: element => element.getAttribute('data-embed-url') ?? null,
        renderHTML: attributes => {
          if (!attributes.url) return {}
          return { 'data-embed-url': attributes.url }
        },
      },
      width: {
        default: '100%',
        parseHTML: element => element.getAttribute('data-embed-width') ?? '100%',
        renderHTML: attributes => ({
          'data-embed-width': attributes.width,
        }),
      },
      height: {
        default: 500,
        parseHTML: element => {
          const raw = element.getAttribute('data-embed-height')
          if (raw === null) return 500
          const parsed = Number(raw)
          return Number.isFinite(parsed) ? parsed : 500
        },
        renderHTML: attributes => ({
          'data-embed-height': String(attributes.height),
        }),
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-embed-block]',
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-embed-block': '' })]
  },

  addNodeView() {
    return nodeView<EmbedBlockAttrs>(EmbedBlockNodeView)
  },

  addCommands() {
    return {
      insertEmbedBlock:
        (attrs?: Partial<EmbedBlockAttrs>) =>
        ({ commands }: CommandProps) =>
          commands.insertContent({ type: this.name, attrs }),

      updateEmbedBlock:
        (pos: number, attrs: Partial<EmbedBlockAttrs>) =>
        ({ tr, dispatch }: CommandProps) => {
          // Guard against out-of-bounds positions — nodeAt throws a RangeError
          // for positions outside the document, so we check bounds first.
          let node: ReturnType<typeof tr.doc.nodeAt>
          try {
            node = tr.doc.nodeAt(pos)
          } catch {
            // Position is outside the document — treat as no-op
            return true
          }

          // No-op if there is no embedBlock node at the given position
          if (node?.type.name !== 'embedBlock') {
            return true
          }

          if (dispatch) {
            tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...attrs })
            dispatch(tr)
          }

          return true
        },
    }
  },
})

export default EmbedBlock
