import type { AnyExtension, JSONContent } from '@tiptap/core'
import { MarkdownManager } from '@tiptap/markdown'
import { Marked, Tokenizer, type marked } from 'marked'

import { markdownSchema } from './schema'

// The HTML token, retyped as `space`: the manager turns a space into nothing (marked's types allow only `html`).
const dropped = <T extends { type: string }>(token: T | undefined): T | undefined =>
  token && Object.assign(token, { type: 'space' })

/**
 * The markdown tokenizer of the editor and the renderer: GFM, raw HTML dropped (its tags, with block HTML and
 * comments; the text between inline tags stays), never executed or turned into marks. @tiptap/markdown would parse
 * known tags through the DOM in a browser and keep them as text on the server: the two renders of one page differed.
 * One instance per manager: each manager registers its extensions' tokenizers on it.
 */
export function markdownMarked(): typeof marked {
  const instance = new Marked()
  instance.use({
    tokenizer: {
      html(src) {
        return dropped(Tokenizer.prototype.html.call(this, src))
      },
      tag(src) {
        return dropped(Tokenizer.prototype.tag.call(this, src))
      },
      // GFM footnotes have no node in the schema, and marked would read a definition as a link definition and drop
      // its text: a definition stays a paragraph of text (`[^1]: source`), as markdown without footnotes shows it.
      def(src) {
        return src.startsWith('[^') ? undefined : false
      },
    },
  })
  // The manager lexes nested list content with `marked.lexer`, which only the global instance has.
  const lexer = (src: string) => instance.Lexer.lex(src, instance.defaults)
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a Marked instance plus `lexer` is what the manager uses of `marked`
  return Object.assign(instance, { lexer }) as unknown as typeof marked
}

const managers = new WeakMap<AnyExtension[], MarkdownManager>()
const NO_MATH: AnyExtension[] = []

/** Markdown as the editor's document (Tiptap JSON). `math`: the Mathematics extension, once loaded. */
export function parseMarkdown(markdown: string, math: AnyExtension[] = NO_MATH): JSONContent {
  let manager = managers.get(math)
  if (!manager) {
    manager = new MarkdownManager({ marked: markdownMarked(), extensions: markdownSchema(math) })
    managers.set(math, manager)
  }
  return manager.parse(markdown)
}
