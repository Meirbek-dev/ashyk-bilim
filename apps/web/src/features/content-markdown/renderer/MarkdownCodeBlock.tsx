'use client'

import { Check, Copy } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { highlightCode, getLanguageDisplayName } from '../lib/shiki'

interface MarkdownCodeBlockProps {
  code: string
  language?: string
  compact?: boolean
  lineNumbers?: boolean
}

export function MarkdownCodeBlock({
  code,
  language,
  compact = false,
  lineNumbers = false,
}: MarkdownCodeBlockProps) {
  const [copied, setCopied] = useState(false)
  const [highlighted, setHighlighted] = useState<string | null>(null)

  const lang = language ?? 'text'
  const displayName = getLanguageDisplayName(lang)
  const isDiff = lang === 'diff'

  useEffect(() => {
    let cancelled = false
    setHighlighted(null)
    highlightCode(code, lang).then(html => {
      if (!cancelled) setHighlighted(html)
    })
    return () => {
      cancelled = true
    }
  }, [code, lang])

  const copy = async () => {
    if (!navigator?.clipboard) return
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      globalThis.setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div
      className={cn(
        'not-prose group my-3 overflow-hidden rounded-md border border-neutral-800 bg-neutral-950 text-neutral-50',
        compact && 'my-1.5',
      )}
    >
      {/* Header bar */}
      <div className="flex h-8 items-center justify-between border-b border-neutral-800 px-3">
        <span
          className={cn(
            'font-mono font-medium text-neutral-400',
            compact ? 'text-[10px]' : 'text-[11px]',
          )}
        >
          {displayName}
        </span>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-6 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
          onClick={copy}
          aria-label={copied ? 'Copied code' : 'Copy code'}
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        </Button>
      </div>

      {/* Code body */}
      {highlighted ? (
        // Shiki injects its own <pre><code> with theme CSS vars.
        // We apply overflow + padding via a wrapper so shiki classes win inside.
        <div
          className={cn(
            'overflow-x-auto',
            '[&_pre]:m-0 [&_pre]:bg-transparent! [&_pre]:p-3 [&_pre]:font-mono [&_pre]:leading-6',
            compact && '[&_pre]:p-2 [&_pre]:text-xs [&_pre]:leading-5',
            lineNumbers &&
              '[&_.line]:before:mr-4 [&_.line]:before:inline-block [&_.line]:before:w-4 [&_.line]:before:text-right [&_.line]:before:text-neutral-600 [&_.line]:before:content-[attr(data-line)]',
            isDiff && [
              '[&_.line]:has-[[data-diff="add"]]:bg-lime-500/10',
              '[&_.line]:has-[[data-diff="remove"]]:bg-rose-500/10',
            ],
          )}
          // Shiki output is sanitized HTML from trusted highlighted code
          dangerouslySetInnerHTML={{ __html: highlighted }}
        />
      ) : (
        // Skeleton / fallback while Shiki loads
        <pre
          className={cn(
            'overflow-x-auto p-3 font-mono text-[13px] leading-6 text-neutral-300',
            compact && 'p-2 text-xs leading-5',
          )}
        >
          <code>{code}</code>
        </pre>
      )}
    </div>
  )
}
