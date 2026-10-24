import { useEffect, useState, type CSSProperties } from 'react'

import { loadHighlighter } from '#/features/markdown'

type Token = { content: string; style: CSSProperties & { '--shiki-light'?: string; '--shiki-dark'?: string } }

/**
 * A code block as the editor view draws it (`.ProseMirror pre` wraps): plain text at once, shiki colours (both themes
 * through light-dark()) once its grammar is loaded.
 */
export function CodeBlock({ language, text }: { language: string | undefined; text: string }) {
  const [lines, setLines] = useState<Token[][] | null>(null)
  useEffect(() => {
    let live = true
    void loadHighlighter().then(async shiki => {
      const lang = shiki.grammarOf(language)
      if (!lang) return null
      const core = await shiki.highlighter(lang)
      const options = { lang, themes: shiki.THEMES, defaultColor: 'light-dark()' } as const
      const tokens = core.codeToTokens(text, options).tokens.map(line =>
        line.map(token => ({
          content: token.content,
          style: {
            color: token.htmlStyle?.['color'],
            '--shiki-light': token.htmlStyle?.['--shiki-light'],
            '--shiki-dark': token.htmlStyle?.['--shiki-dark'],
            fontStyle: token.htmlStyle?.['font-style'] === 'italic' ? 'italic' : undefined,
            fontWeight: token.htmlStyle?.['font-weight'] === 'bold' ? 'bold' : undefined,
            textDecoration: token.htmlStyle?.['text-decoration'],
          },
        })),
      )
      if (live) setLines(tokens)
      return null
    })
    return () => {
      live = false
    }
  }, [language, text])
  const body = lines
    ? lines.flatMap((line, row) => [
        ...(row > 0 ? ['\n'] : []),
        ...line.map((token, index) =>
          Object.values(token.style).some(value => value !== undefined) ? (
            <span key={`${row}.${index}`} style={token.style}>
              {token.content}
            </span>
          ) : (
            token.content
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
