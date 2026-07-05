'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { BookOpenCheckIcon, HistoryIcon, MessageCircleQuestionIcon, PlusIcon } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { InlineError } from '@/components/ui/error-state'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { AICommandList, AIRunProgress, useActivityAIUrlState, useAIRunController } from '@/features/ai-experience'

import { useQAThread, useQueueCourseQuestion } from '../api/use-ask-question'
import { useQAThreads } from '../api/use-qa-threads'
import { QAInput } from './qa-input'
import { QAMessageView } from './qa-message'
import type { QAMessage, QAThreadSummary } from '../lib/types'

export function QAPanel({ courseUuid }: { courseUuid: string }) {
  const t = useTranslations('AiExperience.qaInput')
  const { setThread, thread: selectedThreadUuid } = useActivityAIUrlState('ask')
  const threadQuery = useQAThread(courseUuid, selectedThreadUuid ?? '')
  const threadsQuery = useQAThreads(courseUuid)
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
    const base = selectedThreadUuid && threadQuery.isSuccess ? threadQuery.data : []
    const baseUuids = new Set(base.map(m => m.message_uuid))
    const uniqueLocal = localMessages.filter(m => !baseUuids.has(m.message_uuid))
    return [...base, ...uniqueLocal]
  }, [threadQuery.data, threadQuery.isSuccess, localMessages, selectedThreadUuid])

  function selectThread(nextThreadUuid: string) {
    setThread(nextThreadUuid)
  }

  function submitQuestion(question: string) {
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
        setLocalMessages(current => current.filter(message => message.message_uuid !== pendingUserMessage.message_uuid))
      })
  }

  return (
    <section className="@container/qa-panel grid min-h-0 gap-4 @[28rem]/qa-panel:grid-cols-[minmax(0,1fr)_12rem]">
      <div className="flex min-h-0 flex-col gap-4">
        <AICommandList surface="course" disabled={run.pending} onCommand={command => submitQuestion(command.prompt)} />
        <ScrollArea className="min-h-72 rounded-lg border p-3">
          {threadQuery.isError ? (
            <InlineError description={threadQuery.error.message} error={threadQuery.error} />
          ) : messages.length === 0 ? (
            <QAStarterState
              contextLabel={selectedThreadUuid ? t('threadContext') : t('activityContext')}
              onPrompt={submitQuestion}
            />
          ) : (
            <div className="flex flex-col gap-3">
              {messages.map(message => (
                <QAMessageView key={message.message_uuid} courseUuid={courseUuid} message={message} />
              ))}
            </div>
          )}
        </ScrollArea>
        <AIRunProgress state={run.state} onCancel={run.pending ? run.cancel : undefined} />
        {run.error ? <InlineError description={run.error.message} error={run.error} /> : null}
        <QAInput pending={run.pending} onSubmit={submitQuestion} />
      </div>
      <QAThreadList
        error={threadsQuery.error}
        currentThreadUuid={selectedThreadUuid}
        loading={threadsQuery.isLoading}
        onNewThread={() => setThread(null)}
        onSelectThread={selectThread}
        threads={threadsQuery.isSuccess ? threadsQuery.data : []}
      />
    </section>
  )
}

function QAStarterState({ contextLabel, onPrompt }: { contextLabel: string; onPrompt: (question: string) => void }) {
  const t = useTranslations('AiExperience.qaInput')
  const prompts = [
    t('starterExplain'),
    t('starterSummarize'),
    t('starterQuiz'),
    t('starterBeforeContinuing'),
    t('starterSources'),
  ]

  return (
    <Empty className="min-h-72">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <MessageCircleQuestionIcon aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>{t('emptyTitle')}</EmptyTitle>
        <EmptyDescription>{t('emptyDesc')}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent className="max-w-none">
        <div className="flex flex-wrap justify-center gap-2">
          {prompts.map(prompt => (
            <Button key={prompt} type="button" size="sm" variant="outline" onClick={() => onPrompt(prompt)}>
              {prompt}
            </Button>
          ))}
        </div>
        <Separator />
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Badge variant="secondary">
            <BookOpenCheckIcon data-icon="inline-start" aria-hidden="true" />
            {contextLabel}
          </Badge>
          <span className="text-muted-foreground text-xs">{t('notUsingPrivateContext')}</span>
        </div>
      </EmptyContent>
    </Empty>
  )
}

function QAThreadList({
  currentThreadUuid,
  error,
  loading,
  onNewThread,
  onSelectThread,
  threads,
}: {
  currentThreadUuid: string | null
  error: Error | null
  loading: boolean
  onNewThread: () => void
  onSelectThread: (threadUuid: string) => void
  threads: QAThreadSummary[]
}) {
  const t = useTranslations('AiExperience.qaInput')
  const locale = useLocale()
  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        month: 'short',
        day: 'numeric',
      }),
    [locale],
  )

  return (
    <aside className="flex min-h-0 flex-col gap-3 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex min-w-0 items-center gap-2 text-sm font-medium">
          <HistoryIcon data-icon="inline-start" aria-hidden="true" />
          <span className="truncate">{t('threadsTitle')}</span>
        </h3>
        <Button type="button" size="icon-xs" variant="ghost" aria-label={t('newThread')} onClick={onNewThread}>
          <PlusIcon aria-hidden="true" />
        </Button>
      </div>
      <ScrollArea className="min-h-32 flex-1">
        <div className="flex flex-col gap-2">
          {error ? <InlineError description={error.message} error={error} /> : null}
          {loading ? <p className="text-muted-foreground text-sm">{t('threadsLoading')}</p> : null}
          {!error && !loading && threads.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t('threadsEmpty')}</p>
          ) : null}
          {threads.map(thread => {
            const updatedAt = new Date(thread.updated_at)
            return (
              <Button
                key={thread.thread_uuid}
                type="button"
                variant={currentThreadUuid === thread.thread_uuid ? 'secondary' : 'ghost'}
                className="h-auto min-w-0 justify-start px-2 py-2 text-start"
                onClick={() => onSelectThread(thread.thread_uuid)}
              >
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="truncate text-sm">{thread.title || thread.last_message_preview}</span>
                  <span className="text-muted-foreground flex gap-2 text-xs">
                    <span>{t('threadMessageCount', { count: thread.message_count })}</span>
                    <span>{dateFormatter.format(updatedAt)}</span>
                  </span>
                </span>
              </Button>
            )
          })}
        </div>
      </ScrollArea>
    </aside>
  )
}
