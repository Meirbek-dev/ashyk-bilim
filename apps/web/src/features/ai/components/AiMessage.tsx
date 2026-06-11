'use client'

import { MarkdownContent } from '@/features/content-markdown'
import { cn } from '@/lib/utils'

export interface AiMessageProps {
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  streaming?: boolean
}

export function AiMessage({ role, content, streaming = false }: AiMessageProps) {
  const isUser = role === 'user'

  return (
    <article className={cn('flex min-w-0', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'min-w-0 max-w-[min(42rem,88%)] rounded-lg px-3 py-2 text-sm',
          isUser ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground',
        )}
      >
        {isUser ? (
          <p className="leading-relaxed break-words whitespace-pre-wrap">{content}</p>
        ) : (
          <MarkdownContent content={content} mode="compactRichText" streaming={streaming} />
        )}
      </div>
    </article>
  )
}
