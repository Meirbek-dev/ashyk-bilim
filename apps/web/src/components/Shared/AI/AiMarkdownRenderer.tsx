'use client'

import { MarkdownContent } from '@/features/content-markdown'
import { cn } from '@/lib/utils'

interface AiMarkdownRendererProps {
  content: string
  /** When true, appends a blinking cursor after the last token. */
  isStreaming?: boolean
  className?: string
}

/**
 * Renders AI markdown output using the unified MarkdownContent renderer.
 * Supports GFM (tables, strikethrough, task lists), fenced code with
 * syntax highlighting via Shiki, and streaming cursor support.
 *
 * @deprecated Internal implementation merged into MarkdownContent.
 *   This component is kept as a thin wrapper for backward compatibility.
 */
export function AiMarkdownRenderer({ content, isStreaming = false, className }: AiMarkdownRendererProps) {
  return (
    <MarkdownContent
      content={content}
      mode="compactRichText"
      streaming={isStreaming}
      className={cn('prose-invert', className)}
    />
  )
}
