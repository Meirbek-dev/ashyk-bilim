import CodeBlock from '@tiptap/extension-code-block'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { findChildren } from '@tiptap/core'
import { getHighlighter, getResolvedHighlighter } from '@/features/content-markdown/lib/shiki'

function getDecorations(doc: any, highlighter: any) {
  const decorations: Decoration[] = []

  findChildren(doc, node => node.type.name === 'codeBlock').forEach(block => {
    let from = block.pos + 1
    const language = block.node.attrs.language || 'text'
    const lang = highlighter.getLoadedLanguages().includes(language) ? language : 'text'

    const tokens = highlighter.codeToTokens(block.node.textContent, {
      lang,
      themes: {
        light: 'github-light',
        dark: 'github-dark',
      },
    })

    const lightBg = highlighter.getTheme('github-light').bg
    const darkBg = highlighter.getTheme('github-dark').bg
    const lightFg = highlighter.getTheme('github-light').fg
    const darkFg = highlighter.getTheme('github-dark').fg

    decorations.push(
      Decoration.node(block.pos, block.pos + block.node.nodeSize, {
        style: `--shiki-light-bg: ${lightBg}; --shiki-dark-bg: ${darkBg}; --shiki-light: ${lightFg}; --shiki-dark: ${darkFg};`,
        class: 'shiki',
      }),
    )

    for (const line of tokens.tokens) {
      for (const token of line) {
        const to = from + token.content.length

        const styleObj = token.htmlStyle || {}
        const styleStr = Object.entries(styleObj)
          .map(([key, val]) => `${key}: ${val}`)
          .join(';')

        if (styleStr) {
          decorations.push(
            Decoration.inline(from, to, {
              style: styleStr,
            }),
          )
        }

        from = to
      }
      from += 1 // account for newline character
    }
  })

  return DecorationSet.create(doc, decorations)
}

export const CodeBlockShiki = CodeBlock.extend({
  addProseMirrorPlugins() {
    return [
      ...(this.parent?.() || []),
      new Plugin({
        key: new PluginKey('shiki'),
        view(editorView) {
          if (!getResolvedHighlighter()) {
            getHighlighter().then(() => {
              // Dispatch dummy transaction to trigger decoration update
              const tr = editorView.state.tr.setMeta('shikiLoaded', true)
              editorView.dispatch(tr)
            })
          }
          return {}
        },
        state: {
          init(_, { doc }) {
            const highlighter = getResolvedHighlighter()
            if (!highlighter) {
              return DecorationSet.empty
            }
            return getDecorations(doc, highlighter)
          },
          apply(tr, set) {
            const highlighter = getResolvedHighlighter()
            if (!highlighter) {
              return DecorationSet.empty
            }
            if (tr.docChanged || tr.getMeta('shikiLoaded')) {
              return getDecorations(tr.doc, highlighter)
            }
            return set.map(tr.mapping, tr.doc)
          },
        },
        props: {
          decorations(state) {
            return this.getState(state)
          },
        },
      }),
    ]
  },
})
