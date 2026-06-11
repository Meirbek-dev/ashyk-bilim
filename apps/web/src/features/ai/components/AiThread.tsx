'use client'

import type { UIMessage } from '@tanstack/ai-react'
import type { TextPart } from '@tanstack/ai-client'

import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { AiMessage } from './AiMessage'
import { AiEmptyState } from './AiEmptyState'

export interface AiThreadProps {
  messages: UIMessage[]
  isLoading?: boolean
  className?: string
  onPrompt: (message: string, intent?: string) => void
}

const textFromMessage = (message: UIMessage): string =>
  message.parts
    .filter((part): part is TextPart => part.type === 'text')
    .map(part => part.content)
    .join('')

export function AiThread({ messages, isLoading = false, className, onPrompt }: AiThreadProps) {
  if (messages.length === 0) {
    return <AiEmptyState onPrompt={onPrompt} />
  }

  return (
    <ScrollArea className={cn('min-h-0 flex-1', className)}>
      <div className="flex min-h-full flex-col gap-3 p-4" role="log" aria-live="polite" aria-relevant="additions text">
        {messages.map((message, index) => {
          const content = textFromMessage(message)
          const isStreaming = isLoading && index === messages.length - 1 && message.role === 'assistant'
          if (!content && !isStreaming) return null
          return (
            <AiMessage
              key={message.id ?? `${message.role}-${index}`}
              role={message.role}
              content={content}
              streaming={isStreaming}
            />
          )
        })}
      </div>
    </ScrollArea>
  )
}
