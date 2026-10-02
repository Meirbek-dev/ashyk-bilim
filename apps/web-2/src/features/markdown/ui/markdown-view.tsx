import { use } from 'react'
import ReactMarkdown, { type Components, type UrlTransform } from 'react-markdown'
import remarkGfm from 'remark-gfm'

import { m } from '#/paraglide/messages'

import { safeImageUrl, safeUrl } from '../model/sanitize'
import { CodeBlock } from './code-block'
import { rehypeExternalLinks } from './external-links'
import proseCss from './prose.css?url'

type Math = typeof import('./math')
let math: Promise<Math> | null = null
const loadMath = () => (math ??= import('./math'))

// Links: http(s), mailto, relative. Images: platform storage only; anything else renders as its alt text.
const urlTransform: UrlTransform = (url, key) => (key === 'src' ? safeImageUrl(url) : safeUrl(url)) ?? ''

const components: Components = {
  pre: ({ node }) => {
    const code = node?.children[0]
    if (code?.type !== 'element' || code.tagName !== 'code') return null
    const classes = code.properties['className']
    const language = Array.isArray(classes) ? /language-(\S+)/.exec(classes.join(' '))?.[1] : undefined
    const text = code.children.map(child => (child.type === 'text' ? child.value : '')).join('')
    return <CodeBlock code={text.replace(/\n$/, '')} language={language} />
  },
  img: ({ src, alt }) =>
    src ? (
      <img src={src} alt={alt ?? ''} loading="lazy" />
    ) : (
      <span className="text-muted-foreground">{alt ? m.markdown_image({ alt }) : m.markdown_image_untitled()}</span>
    ),
}

type MarkdownViewProps = {
  content: string
  /** Announce appended text to screen readers (AI answers that stream in). */
  live?: boolean
}

/**
 * The one markdown renderer (course texts, task statements, feedback, AI answers): GFM, `$math$` (KaTeX,
 * loaded when the text has a `$`), shiki code blocks. Raw HTML is never executed: it shows as text.
 */
export function MarkdownView({ content, live = false }: MarkdownViewProps) {
  const katex = content.includes('$') ? use(loadMath()) : null
  return (
    <div className="ab-prose" aria-live={live ? 'polite' : undefined}>
      <link rel="stylesheet" href={proseCss} precedence="ab-prose" />
      {katex ? <link rel="stylesheet" href={katex.katexCss} precedence="ab-katex" /> : null}
      <ReactMarkdown
        remarkPlugins={katex ? [remarkGfm, katex.remarkMath] : [remarkGfm]}
        rehypePlugins={katex ? [rehypeExternalLinks, katex.rehypeKatex] : [rehypeExternalLinks]}
        urlTransform={urlTransform}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
