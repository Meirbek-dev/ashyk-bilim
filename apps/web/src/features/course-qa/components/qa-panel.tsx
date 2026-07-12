'use client'

import { useCallback, useMemo, useState } from 'react'
import { BookOpenCheckIcon, HistoryIcon, MessageCircleQuestionIcon, PlusIcon, Trash2Icon } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'

import { Badge } from '@/components/ui/badge'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { InlineError } from '@/components/ui/error-state'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { AICommandList, useActivityAIUrlState } from '@/features/ai-experience'

import { useQAThread } from '../api/use-ask-question'
import { useCourseQAChat } from '../api/use-course-qa-chat'
import { useDeleteQAThread } from '../api/use-delete-thread'
import { useQAThreads } from '../api/use-qa-threads'
import { QAInput } from './qa-input'
import { QAMessageView } from './qa-message'
import type { QAMessage, QAThreadSummary } from '../lib/types'

export function QAPanel({ activityUuid, courseUuid }: { activityUuid?: string | null; courseUuid: string }) {
  const t = useTranslations('AiExperience.qaInput')
  const { setThread, thread: selectedThreadUuid } = useActivityAIUrlState('ask')
  const threadQuery = useQAThread(courseUuid, selectedThreadUuid ?? '')
  const threadsQuery = useQAThreads(courseUuid)
  const deleteThread = useDeleteQAThread(courseUuid)
  const [deleteCandidate, setDeleteCandidate] = useState<string | null>(null)
  const selectThread = useCallback((nextThreadUuid: string) => setThread(nextThreadUuid), [setThread])
  const chat = useCourseQAChat({
    courseUuid,
    onThread: selectThread,
    threadUuid: selectedThreadUuid,
    ...(activityUuid ? { activityUuid } : {}),
  })

  const messages = useMemo(() => {
    const base = selectedThreadUuid && threadQuery.isSuccess ? threadQuery.data : []
    const pending: QAMessage[] = []
    if (chat.pendingQuestion) {
      pending.push({
        message_uuid: 'pending-user',
        role: 'user',
        content: chat.pendingQuestion,
        citations_json: {},
        created_at: new Date().toISOString(),
      })
    }
    if (chat.partialAnswer) {
      pending.push({
        message_uuid: 'pending-assistant',
        role: 'assistant',
        content: chat.partialAnswer,
        citations_json: { citations: chat.citations },
        message_metadata: { incomplete: chat.status === 'cancelled' },
        created_at: new Date().toISOString(),
      })
    }
    return [...base, ...pending]
  }, [
    chat.citations,
    chat.partialAnswer,
    chat.pendingQuestion,
    chat.status,
    threadQuery.data,
    threadQuery.isSuccess,
    selectedThreadUuid,
  ])

  function submitQuestion(question: string) {
    void chat.submit(question)
  }

  return (
    <section className="@container/qa-panel grid h-full min-h-0 gap-4 @[28rem]/qa-panel:grid-cols-[minmax(0,1fr)_12rem]">
      <div className="flex min-h-0 flex-col gap-4">
        <AICommandList surface="course" disabled={chat.pending} onCommand={command => submitQuestion(command.prompt)} />
        <ScrollArea className="bg-background min-h-0 flex-1 rounded-lg border p-3 [content-visibility:auto]">
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
        <div aria-live="polite" aria-atomic="true" className="sr-only">
          {chat.status === 'streaming' ? t('streamingStatus') : null}
          {chat.status === 'cancelled' ? t('cancelledStatus') : null}
        </div>
        {chat.errorCode ? (
          <div className="border-destructive/30 bg-destructive/5 flex flex-wrap items-center gap-2 rounded-lg border p-3">
            <p className="min-w-0 flex-1 text-sm">{t('error')}</p>
            <Button type="button" size="sm" variant="outline" onClick={chat.retry}>
              {t('retry')}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={chat.reset}>
              {t('dismiss')}
            </Button>
          </div>
        ) : null}
        <QAInput pending={chat.pending} onStop={chat.stop} onSubmit={submitQuestion} />
      </div>
      <QAThreadList
        error={threadsQuery.error}
        currentThreadUuid={selectedThreadUuid}
        loading={threadsQuery.isLoading}
        onNewThread={() => setThread(null)}
        onDeleteThread={setDeleteCandidate}
        onSelectThread={selectThread}
        threads={threadsQuery.isSuccess ? threadsQuery.data : []}
      />
      <AlertDialog open={deleteCandidate !== null} onOpenChange={open => !open && setDeleteCandidate(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('deleteThread')}</AlertDialogTitle>
            <AlertDialogDescription>{t('deleteConfirm')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('keepThread')}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleteThread.isPending}
              onClick={() => {
                if (!deleteCandidate) return
                const threadUuid = deleteCandidate
                deleteThread.mutate(threadUuid, {
                  onSuccess: () => {
                    if (selectedThreadUuid === threadUuid) setThread(null)
                    setDeleteCandidate(null)
                  },
                })
              }}
            >
              {t('confirmDelete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
  onDeleteThread,
  onSelectThread,
  threads,
}: {
  currentThreadUuid: string | null
  error: Error | null
  loading: boolean
  onNewThread: () => void
  onDeleteThread: (threadUuid: string) => void
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
              <div key={thread.thread_uuid} className="flex min-w-0 items-center gap-1">
                <Button
                  type="button"
                  variant={currentThreadUuid === thread.thread_uuid ? 'secondary' : 'ghost'}
                  className="h-auto min-w-0 flex-1 justify-start px-2 py-2 text-start"
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
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label={t('deleteThread')}
                  onClick={() => onDeleteThread(thread.thread_uuid)}
                >
                  <Trash2Icon aria-hidden="true" />
                </Button>
              </div>
            )
          })}
        </div>
      </ScrollArea>
    </aside>
  )
}
