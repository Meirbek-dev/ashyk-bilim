'use client'

import { cn } from '@/lib/utils'

/**
 * Streaming cursor — a blinking caret appended after the last token of
 * AI-streamed markdown output. Rendered as an inline element so it flows
 * naturally within paragraph, list-item, and heading text.
 */
export function AiStreamingCursor({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'ml-0.5 inline-block h-[1em] w-[2px] translate-y-[1px] animate-pulse rounded-sm bg-current opacity-80',
        className,
      )}
      aria-hidden="true"
    />
  )
}
