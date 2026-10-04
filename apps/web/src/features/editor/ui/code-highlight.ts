import { Extension } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view'

import { loadHighlighter } from '#/features/markdown'

type Shiki = Awaited<ReturnType<typeof loadHighlighter>>
type Core = Awaited<ReturnType<Shiki['highlighter']>>

const key = new PluginKey<DecorationSet>('codeHighlight')

function decorate(doc: PMNode, shiki: Shiki | null, core: Core | null): DecorationSet {
  if (!shiki || !core) return DecorationSet.empty
  const decorations: Decoration[] = []
  doc.descendants((node, pos) => {
    if (node.type.name !== 'codeBlock') return true
    const lang = shiki.grammarOf(String(node.attrs['language'] ?? ''))
    if (!lang || !core.getLoadedLanguages().includes(lang)) return false
    let from = pos + 1
    for (const line of core.codeToTokens(node.textContent, { lang, themes: shiki.THEMES, defaultColor: false })
      .tokens) {
      for (const token of line) {
        const style = Object.entries(token.htmlStyle ?? {})
          .map(([name, value]) => `${name}:${value}`)
          .join(';')
        if (style) decorations.push(Decoration.inline(from, from + token.content.length, { style }))
        from += token.content.length
      }
      from += 1
    }
    return false
  })
  return DecorationSet.create(doc, decorations)
}

/** Shiki colors in editor code blocks: grammars load on first use, then the blocks are re-decorated. */
export const CodeHighlight = Extension.create({
  name: 'codeHighlight',
  addProseMirrorPlugins() {
    let shiki: Shiki | null = null
    let core: Core | null = null
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
        shiki = module
        const grammars = missing.map(language => module.grammarOf(language)).filter(grammar => grammar !== null)
        for (const grammar of grammars) core = await module.highlighter(grammar)
        if (!view.isDestroyed && grammars.length > 0) view.dispatch(view.state.tr.setMeta(key, true))
        return null
      })
    }
    return [
      new Plugin({
        key,
        state: {
          init: (_config, { doc }) => decorate(doc, shiki, core),
          apply: (tr, set) =>
            tr.docChanged || tr.getMeta(key) ? decorate(tr.doc, shiki, core) : set.map(tr.mapping, tr.doc),
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
