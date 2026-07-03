'use client'

import { useMemo, useState } from 'react'
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
  const [localMessages, setLocalMessages] = useState<QAMessage[]>([])
  const [prevThread, setPrevThread] = useState<string | null>(selectedThreadUuid)
  const ask = useAskCourseQuestion(courseUuid)
  const nextParams = useMemo(() => new URLSearchParams(searchParams.toString()), [searchParams])

  if (selectedThreadUuid !== prevThread) {
    setPrevThread(selectedThreadUuid)
    if (!selectedThreadUuid || prevThread) {
      setLocalMessages([])
    }
  }

  const messages = useMemo(() => {
    if (!selectedThreadUuid) return []
    const base = threadQuery.data ?? []
    const baseUuids = new Set(base.map(m => m.message_uuid))
    const uniqueLocal = localMessages.filter(m => !baseUuids.has(m.message_uuid))
    return [...base, ...uniqueLocal]
  }, [threadQuery.data, localMessages, selectedThreadUuid])

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
            { question, thread_uuid: selectedThreadUuid, language: 'auto' },
            {
              onSuccess: response => {
                setLocalMessages(current => [...current, response.user_message, response.assistant_message])
                selectThread(response.thread_uuid)
              },
            },
          )
        }
      />
    </section>
  )
}
