import { toJsxRuntime } from 'hast-util-to-jsx-runtime'
import { Check, Copy } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Fragment, jsx, jsxs } from 'react/jsx-runtime'

import { m } from '#/paraglide/messages'
import { IconButton } from '#/shared/components/icon-button'

import { grammarOf, highlighter, THEMES } from './shiki'

type CodeBlockProps = { code: string; language?: string | undefined }

/**
 * A fenced code block: plain `<pre>` first, highlighted once its grammar has loaded (shiki, lazy).
 * Shiki's dual-theme colors are CSS variables; prose.css picks the one of the current mode (light-dark()).
 */
export function CodeBlock({ code, language }: CodeBlockProps) {
  const grammar = grammarOf(language)
  const [highlighted, setHighlighted] = useState<{ code: string; grammar: string; node: ReactNode } | null>(null)
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    let live = true
    if (grammar)
      void highlighter(grammar)
        .then(ready => {
          const tree = ready.codeToHast(code, { lang: grammar, themes: THEMES, defaultColor: false })
          if (live) setHighlighted({ code, grammar, node: toJsxRuntime(tree, { Fragment, jsx, jsxs }) })
          return null
        })
        // Highlighting is optional: a failed grammar download leaves the current source readable.
        .catch(() => undefined)
    return () => {
      live = false
    }
  }, [code, grammar])
  const copy = () => {
    void navigator.clipboard.writeText(code).then(() => setCopied(true))
  }
  return (
    <figure className="ab-code my-4 overflow-hidden rounded-md border border-border bg-muted">
      <figcaption className="flex items-center justify-between gap-2 border-b border-border pl-3 text-xs text-muted-foreground">
        <span>{grammar ?? m.markdown_code_plain()}</span>
        <IconButton
          label={copied ? m.markdown_copied() : m.markdown_copy()}
          icon={copied ? <Check aria-hidden /> : <Copy aria-hidden />}
          onClick={copy}
        />
      </figcaption>
      {highlighted?.code === code && highlighted.grammar === grammar ? (
        highlighted.node
      ) : (
        <pre>
          <code>{code}</code>
        </pre>
      )}
    </figure>
  )
}
