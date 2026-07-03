'use client'

import { useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'

import { ScrollArea } from '@/components/ui/scroll-area'
import { AIEmptyState } from '@/features/ai-experience'

import { useAskCourseQuestion, useQAThread } from '../api/use-ask-question'
import { QAInput } from './qa-input'
import { QAMessageView } from './qa-message'
import type { QAMessage } from '../lib/types'

export function QAPanel({ courseUuid }: { courseUuid: string }) {
  const t = useTranslations('AiExperience.qaInput')
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const selectedThreadUuid = searchParams.get('thread')
  const threadQuery = useQAThread(courseUuid, selectedThreadUuid ?? '')
  const [threadUuid, setThreadUuid] = useState<string | null>(selectedThreadUuid)
  const [messages, setMessages] = useState<QAMessage[]>([])
  const ask = useAskCourseQuestion(courseUuid)
  const nextParams = useMemo(() => new URLSearchParams(searchParams.toString()), [searchParams])

  useEffect(() => {
    setThreadUuid(selectedThreadUuid)
  }, [selectedThreadUuid])

  useEffect(() => {
    if (threadQuery.data) {
      setMessages(threadQuery.data)
    } else if (!selectedThreadUuid) {
      setMessages([])
    }
  }, [selectedThreadUuid, threadQuery.data])

  function selectThread(nextThreadUuid: string) {
    nextParams.set('thread', nextThreadUuid)
    router.replace(`${pathname}?${nextParams.toString()}`, { scroll: false })
  }

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
            { question, thread_uuid: threadUuid, language: 'auto' },
            {
              onSuccess: response => {
                setThreadUuid(response.thread_uuid)
                setMessages(current => [...current, response.user_message, response.assistant_message])
                selectThread(response.thread_uuid)
              },
            },
          )
        }
      />
    </section>
  )
}
