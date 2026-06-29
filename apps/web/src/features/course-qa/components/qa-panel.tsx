'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'

import { ScrollArea } from '@/components/ui/scroll-area'
import { AIEmptyState } from '@/features/ai-experience'

import { useAskCourseQuestion } from '../api/use-ask-question'
import { QAInput } from './qa-input'
import { QAMessageView } from './qa-message'
import type { QAMessage } from '../lib/types'

export function QAPanel({ courseUuid, userRole = 'student' }: { courseUuid: string; userRole?: string }) {
  const t = useTranslations('AiExperience.qaInput')
  const [threadUuid, setThreadUuid] = useState<string | null>(null)
  const [messages, setMessages] = useState<QAMessage[]>([])
  const ask = useAskCourseQuestion(courseUuid)

  return (
    <section className="flex min-h-0 flex-col gap-4">
      <ScrollArea className="min-h-72 rounded-lg border p-3">
        {messages.length === 0 ? (
          <AIEmptyState title={t('emptyTitle')} description={t('emptyDesc')} />
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
            { question, thread_uuid: threadUuid, role: userRole, language: 'auto' },
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
