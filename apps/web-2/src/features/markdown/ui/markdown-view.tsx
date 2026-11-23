import { use, useDeferredValue } from 'react'

import { parseMarkdown } from '../model/parser'
import { RichText } from './rich-text'
import proseCss from '#/styles/prose.css?url'

type Math = typeof import('./math')
let math: Promise<Math> | null = null
const loadMath = () => (math ??= import('./math'))

type MarkdownViewProps = {
  content: string
  /** Announce appended text to screen readers (AI answers that stream in). */
  live?: boolean
}

/**
 * The one markdown renderer (course texts, task statements, feedback, AI answers): the markdown editor's parser
 * (@tiptap/markdown: GFM, task lists, `$math$` with KaTeX loaded when the text has a `$`) drawn as Tiptap's read-only
 * view would, highlighted code blocks. Raw HTML is never executed. A streamed answer re-parses per chunk at a
 * deferred priority: input stays responsive and the last complete render stays up while a newer one is computed.
 */
export function MarkdownView({ content, live = false }: MarkdownViewProps) {
  const text = useDeferredValue(content)
  const loaded = text.includes('$') ? use(loadMath()) : null
  const doc = parseMarkdown(text, loaded?.mathSchema)
  return (
    <div className="ab-prose" aria-live={live ? 'polite' : undefined}>
      <link rel="stylesheet" href={proseCss} precedence="ab-prose" />
      {loaded ? <link rel="stylesheet" href={loaded.katexCss} precedence="ab-katex" /> : null}
      <RichText doc={doc} katex={loaded?.katex ?? null} />
    </div>
  )
}
