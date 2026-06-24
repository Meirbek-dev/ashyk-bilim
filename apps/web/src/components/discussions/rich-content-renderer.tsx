'use client'

import { useEffect, useState } from 'react'
import { renderEditorHtml } from '@components/Objects/Editor/core'
import DOMPurify from 'dompurify'
import { cn } from '@/lib/utils'

interface RichContentRendererProps {
  content: string
  className?: string
}

/** Resolve content: JSON string → HTML via Tiptap schema; raw HTML → pass through. */
function resolveToHtml(content: string): string {
  if (!content) return ''
  try {
    return renderEditorHtml(JSON.parse(content) as Record<string, unknown>, {
      preset: 'viewing',
    })
  } catch {
    // not JSON – treat as legacy HTML
  }
  return content
}

export default function RichContentRenderer({ content, className = '' }: RichContentRendererProps) {
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    queueMicrotask(() => setIsMounted(true))
  }, [])

  const html = isMounted ? resolveToHtml(content) : ''

  // Sanitize the HTML content to prevent XSS attacks
  const sanitizedContent =
    typeof globalThis.window !== 'undefined'
      ? DOMPurify.sanitize(html, {
          ALLOWED_TAGS: [
            'p',
            'br',
            'strong',
            'em',
            'u',
            's',
            'code',
            'pre',
            'h1',
            'h2',
            'h3',
            'h4',
            'h5',
            'h6',
            'ul',
            'ol',
            'li',
            'blockquote',
            'a',
            'img',
            'div',
            'span',
            'iframe', // For YouTube embeds
          ],
          ALLOWED_ATTR: [
            'href',
            'target',
            'rel',
            'src',
            'alt',
            'width',
            'height',
            'class',
            'style',
            'frameborder',
            'allowfullscreen',
            'allow', // For YouTube embeds
          ],
          ALLOWED_URI_REGEXP:
            /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|cid|xmpp|data):|[^a-z]|[+.a-z-]+(?:[^+.:a-z-]|$))/i,
        })
      : html

  return (
    <div
      className={cn(
        'prose prose-sm max-w-none',
        'overflow-wrap-anywhere word-break-break-word break-words',
        'prose-headings:mt-4 prose-headings:mb-2 prose-headings:font-semibold prose-headings:text-foreground',
        'prose-p:my-2 prose-p:break-words prose-p:text-muted-foreground prose-p:leading-relaxed',
        'prose-strong:font-semibold prose-strong:text-foreground',
        'prose-em:text-muted-foreground prose-em:italic',
        'prose-code:break-all prose-code:rounded prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:font-mono prose-code:text-foreground prose-code:text-sm',
        'prose-pre:my-3 prose-pre:overflow-x-auto prose-pre:whitespace-pre-wrap prose-pre:rounded-md prose-pre:bg-muted prose-pre:p-3 prose-pre:text-foreground',
        'prose-blockquote:my-3 prose-blockquote:break-words prose-blockquote:border-border prose-blockquote:border-l-4 prose-blockquote:pl-4 prose-blockquote:text-muted-foreground prose-blockquote:italic',
        'prose-ul:my-2 prose-ul:ml-4 prose-ul:list-outside prose-ul:list-disc prose-ul:text-muted-foreground',
        'prose-ol:my-2 prose-ol:ml-4 prose-ol:list-outside prose-ol:list-decimal prose-ol:text-muted-foreground',
        'prose-li:ml-0 prose-li:break-words prose-li:text-muted-foreground',
        'prose-a:break-all prose-a:text-primary prose-a:underline prose-a:hover:text-primary/80',
        'prose-img:my-3 prose-img:h-auto prose-img:max-w-full prose-img:rounded-lg',
        // YouTube iframe styling
        '[&_iframe]:my-3 [&_iframe]:aspect-video [&_iframe]:w-full [&_iframe]:rounded-lg',
        // Handle empty content
        'min-h-[1rem]',
        className,
      )}
      dangerouslySetInnerHTML={{ __html: sanitizedContent }}
    />
  )
}
