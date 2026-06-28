'use client'

import { useState } from 'react'

import { ScrollArea } from '@/components/ui/scroll-area'
import { AIEmptyState } from '@/features/ai-experience'

import { useAskCourseQuestion } from '../api/use-ask-question'
import { QAInput } from './qa-input'
import { QAMessageView } from './qa-message'
import type { QAMessage } from '../lib/types'

export function QAPanel({ courseUuid, role = 'student' }: { courseUuid: string; role?: string }) {
  const [threadUuid, setThreadUuid] = useState<string | null>(null)
  const [messages, setMessages] = useState<QAMessage[]>([])
  const ask = useAskCourseQuestion(courseUuid)

  return (
    <section className="flex min-h-0 flex-col gap-4">
      <ScrollArea className="min-h-72 rounded-lg border p-3">
        {messages.length === 0 ? (
          <AIEmptyState
            title="No questions yet"
            description="Ask about this course and the answer will cite course material."
          />
        ) : (
          <div className="flex flex-col gap-3">
            {messages.map(message => (
              <QAMessageView key={message.message_uuid} message={message} />
            ))}
          </div>
        )}
      </ScrollArea>
      <QAInput
        pending={ask.isPending}
        onSubmit={question =>
          ask.mutate(
            { question, thread_uuid: threadUuid, role, language: 'auto' },
            {
              onSuccess: response => {
                setThreadUuid(response.thread_uuid)
                setMessages(current => [...current, response.user_message, response.assistant_message])
              },
            },
          )
        }
      />
    </section>
  )
}
