import { useEffect, useState } from 'react'

import { loadHighlighter, type CodeToken } from '#/features/markdown'

/**
 * A code block as the editor view draws it (`.ProseMirror pre` wraps): plain text at once, the code editor's token
 * classes once its language has loaded.
 */
export function CodeBlock({ language, text }: { language: string | undefined; text: string }) {
  const [lines, setLines] = useState<CodeToken[][] | null>(null)
  useEffect(() => {
    let live = true
    void loadHighlighter()
      .then(async highlighter => {
        const id = highlighter.languageOf(language)
        if (!id) return null
        const highlight = await highlighter.loadLanguage(id)
        if (live) setLines(highlight(text))
        return null
      })
      // Highlighting is optional: a failed grammar download leaves the source readable.
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [language, text])
  const body = lines
    ? lines.flatMap((line, row) => [
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
    : text
  return (
    <pre className="whitespace-pre-wrap">
      <code className={language ? `language-${language}` : undefined}>
        {body}
        {text === '' || text.endsWith('\n') ? <br /> : null}
      </code>
    </pre>
  )
}
