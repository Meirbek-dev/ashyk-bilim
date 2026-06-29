'use client'

import { useEffect, useRef } from 'react'
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

/**
 * Hook: given streaming content, find the last rendered DOM element in a
 * container and append the cursor to it. Used internally by MarkdownContent
 * when streaming=true.
 */
export function useStreamingCursor(containerRef: React.RefObject<HTMLDivElement | null>, isStreaming: boolean) {
  const cursorRef = useRef<HTMLSpanElement | null>(null)

  useEffect(() => {
    if (!isStreaming || !containerRef.current) {
      cursorRef.current?.remove()
      cursorRef.current = null
      return
    }

    // Find the deepest last text node in the container
    const walker = document.createTreeWalker(containerRef.current, NodeFilter.SHOW_TEXT)
    let lastNode: Node | null = null
    let node: Node | null
    while ((node = walker.nextNode())) {
      lastNode = node
    }

    if (!lastNode?.parentElement) return

    // Create or reuse cursor span
    if (!cursorRef.current) {
      const span = document.createElement('span')
      span.className =
        'ml-0.5 inline-block h-[1em] w-[2px] translate-y-[1px] animate-pulse rounded-sm bg-current opacity-80'
      span.setAttribute('aria-hidden', 'true')
      cursorRef.current = span
    }

    lastNode.parentElement.appendChild(cursorRef.current)

    return () => {
      cursorRef.current?.remove()
    }
  })
}
