import { Check, Copy } from 'lucide-react'
import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'

import { m } from '#/paraglide/messages'
import { IconButton } from '#/shared/components/icon-button'

import { languageOf, loadedLanguage, loadLanguage, subscribeLanguages, type Highlight } from './languages'

type CodeBlockProps = { code: string; language?: string | undefined }

/** Highlighted lines as spans with the theme's token classes. */
function highlighted(code: string, highlight: Highlight): ReactNode[] {
  return highlight(code).flatMap((line, row) => [
    ...(row > 0 ? ['\n'] : []),
    ...line.map((token, index) =>
      token.className ? (
        <span key={`${row}.${index}`} className={token.className}>
          {token.text}
        </span>
      ) : (
        token.text
      ),
    ),
  ])
}

/**
 * A fenced code block: plain `<pre>` first, highlighted once its language has loaded (lazy). Later
 * text (an AI answer streaming in) highlights in the same render: the language stays loaded. The server and hydration
 * render plain code (the server never loads a language), so the first client render matches the server's HTML.
 */
export function CodeBlock({ code, language }: CodeBlockProps) {
  const id = languageOf(language)
  const highlight = useSyncExternalStore(
    subscribeLanguages,
    () => (id === null ? null : (loadedLanguage(id) ?? null)),
    () => null,
  )
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    // Highlighting is optional: a failed grammar download leaves the source readable.
    if (id !== null && !highlight) void loadLanguage(id).catch(() => undefined)
  }, [id, highlight])
  const copy = () => {
    void navigator.clipboard.writeText(code).then(() => setCopied(true))
  }
  return (
    <figure className="ab-code my-5 border-y [&_pre]:bg-transparent [&_pre]:px-0 [&_pre]:pt-0">
      <figcaption className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{id ?? m.markdown_code_plain()}</span>
        <IconButton
          label={copied ? m.markdown_copied() : m.markdown_copy()}
          icon={copied ? <Check aria-hidden /> : <Copy aria-hidden />}
          onClick={copy}
        />
      </figcaption>
      <pre>
        <code className={id ? `language-${id}` : undefined}>{highlight ? highlighted(code, highlight) : code}</code>
      </pre>
    </figure>
  )
}
