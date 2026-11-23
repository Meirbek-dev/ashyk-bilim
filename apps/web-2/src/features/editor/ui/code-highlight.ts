import { Extension } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view'

import { loadHighlighter } from '#/features/markdown'

type Highlighter = Awaited<ReturnType<typeof loadHighlighter>>

const key = new PluginKey<DecorationSet>('codeHighlight')

function decorate(doc: PMNode, highlighter: Highlighter | null): DecorationSet {
  if (!highlighter) return DecorationSet.empty
  const decorations: Decoration[] = []
  doc.descendants((node, pos) => {
    if (node.type.name !== 'codeBlock') return true
    const id = highlighter.languageOf(String(node.attrs['language'] ?? ''))
    const highlight = id ? highlighter.loadedLanguage(id) : undefined
    if (!highlight) return false
    let from = pos + 1
    for (const line of highlight(node.textContent)) {
      for (const token of line) {
        if (token.className)
          decorations.push(Decoration.inline(from, from + token.text.length, { class: token.className }))
        from += token.text.length
      }
      from += 1
    }
    return false
  })
  return DecorationSet.create(doc, decorations)
}

/** Code colors in editor code blocks (the code editor's token classes): languages load on first use, then re-decorate. */
export const CodeHighlight = Extension.create({
  name: 'codeHighlight',
  addProseMirrorPlugins() {
    let highlighter: Highlighter | null = null
    const requested = new Set<string>()
    const load = (view: EditorView) => {
      const languages = new Set<string>()
      view.state.doc.descendants(node => {
        if (node.type.name === 'codeBlock' && node.attrs['language']) languages.add(String(node.attrs['language']))
        return node.type.name !== 'codeBlock'
      })
      const missing = [...languages].filter(language => !requested.has(language))
      if (missing.length === 0) return
      for (const language of missing) requested.add(language)
      void loadHighlighter().then(async module => {
        highlighter = module
        const ids = missing.map(language => module.languageOf(language)).filter(id => id !== null)
        // A grammar that fails to load leaves its blocks plain; the others still color.
        const results = await Promise.allSettled(ids.map(id => module.loadLanguage(id)))
        if (!view.isDestroyed && results.some(result => result.status === 'fulfilled'))
          view.dispatch(view.state.tr.setMeta(key, true))
        return null
      })
    }
    return [
      new Plugin({
        key,
        state: {
          init: (_config, { doc }) => decorate(doc, highlighter),
          apply: (tr, set) =>
            tr.docChanged || tr.getMeta(key) ? decorate(tr.doc, highlighter) : set.map(tr.mapping, tr.doc),
        },
        props: { decorations: state => key.getState(state) },
        view: view => {
          load(view)
          return { update: load }
        },
      }),
    ]
  },
})
