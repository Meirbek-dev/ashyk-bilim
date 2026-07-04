'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'

import { ScrollArea } from '@/components/ui/scroll-area'
import { AIEmptyState, AIRunProgress, useAIRunController } from '@/features/ai-experience'

import { useQAThread, useQueueCourseQuestion } from '../api/use-ask-question'
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
  const prevThreadRef = useRef<string | null>(selectedThreadUuid)
  const queue = useQueueCourseQuestion(courseUuid)
  const invalidationKeys = useMemo(
    () => [
      ['course-qa-threads', courseUuid],
      ['course-qa-thread', courseUuid, selectedThreadUuid ?? ''],
    ],
    [courseUuid, selectedThreadUuid],
  )
  const run = useAIRunController({
    invalidateQueryKeys: invalidationKeys,
    queue,
  })

  useEffect(() => {
    const prevThread = prevThreadRef.current
    if (selectedThreadUuid !== prevThread) {
      prevThreadRef.current = selectedThreadUuid
      if (!selectedThreadUuid || prevThread) {
        setLocalMessages([])
      }
    }
  }, [selectedThreadUuid])

  const messages = useMemo(() => {
    if (!selectedThreadUuid) return []
    const base = threadQuery.data ?? []
    const baseUuids = new Set(base.map(m => m.message_uuid))
    const uniqueLocal = localMessages.filter(m => !baseUuids.has(m.message_uuid))
    return [...base, ...uniqueLocal]
  }, [threadQuery.data, localMessages, selectedThreadUuid])

  function selectThread(nextThreadUuid: string) {
    const nextParams = new URLSearchParams(searchParams.toString())
    nextParams.set('thread', nextThreadUuid)
    nextParams.set('aiThread', nextThreadUuid)
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
      <AIRunProgress state={run.state} onCancel={run.pending ? run.cancel : undefined} />
      <QAInput
        pending={run.pending}
        onSubmit={question => {
          const pendingUserMessage: QAMessage = {
            message_uuid: `local_${globalThis.crypto?.randomUUID?.() ?? Date.now()}`,
            role: 'user',
            content: question,
            citations_json: {},
            created_at: new Date().toISOString(),
          }
          setLocalMessages(current => [...current, pendingUserMessage])
          void run
            .start({ question, thread_uuid: selectedThreadUuid, language: 'auto' })
            .then(response => {
              const threadUuid = response.run_metadata?.thread_uuid
              if (typeof threadUuid === 'string') selectThread(threadUuid)
              return undefined
            })
            .catch(() => {
              setLocalMessages(current =>
                current.filter(message => message.message_uuid !== pendingUserMessage.message_uuid),
              )
            })
        }}
      />
    </section>
  )
}
