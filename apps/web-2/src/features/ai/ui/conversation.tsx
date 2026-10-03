import { useSuspenseQueries } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'
import type { ActivityId, AiThreadId, CourseId } from '#/shared/api/gen/types.gen'
import { ErrorAlert } from '#/shared/components/error-alert'
import { Button } from '#/shared/ui/button'

import { STOPPED, transcript } from '../model/chat'
import { runErrorText } from '../model/labels'
import { threadOptions } from '../queries'
import { AskForm } from './ask-form'
import { Transcript } from './transcript'
import { useQaTurn } from './use-qa-turn'

type ConversationProps = {
  courseId: CourseId
  activityId: ActivityId | undefined
  /** The open thread; none for a new one. */
  threadId: AiThreadId | undefined
  onThread: (threadId: AiThreadId) => void
}

/** One thread: its transcript, the turn in flight, the error with "Retry", the question box with "Stop". */
export function Conversation({ courseId, activityId, threadId, onThread }: ConversationProps) {
  // A new thread has nothing to read yet: no query at all.
  const queries: ReturnType<typeof threadOptions>[] = threadId ? [threadOptions(courseId, threadId)] : []
  const saved = useSuspenseQueries({ queries })
  const messages = saved.flatMap(result => result.data)
  const chat = useQaTurn({ courseId, activityId, threadId, onThread })
  const failure = chat.turn?.status === 'failed' ? chat.turn.errorCode : null
  return (
    <div className="flex flex-col gap-4">
      <Transcript entries={transcript(messages, chat.turn)} />
      {failure && failure !== STOPPED ? (
        <div className="flex flex-col items-start gap-2">
          <ErrorAlert>{runErrorText(failure)}</ErrorAlert>
          <Button variant="outline" size="sm" onClick={chat.retry}>
            {m.ui_retry()}
          </Button>
        </div>
      ) : null}
      <AskForm
        label={m.ai_question()}
        pending={chat.pending}
        onAsk={chat.ask}
        stop={chat.pending ? { label: m.ai_stop(), onStop: chat.stop } : null}
      />
    </div>
  )
}
