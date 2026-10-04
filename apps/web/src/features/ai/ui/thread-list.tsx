import { useSuspenseQuery } from '@tanstack/react-query'
import { Plus } from 'lucide-react'

import { m } from '#/paraglide/messages'
import type { AiThreadId, CourseId } from '#/shared/api/gen/types.gen'
import { formatDate } from '#/shared/i18n/format'
import { Button } from '#/shared/ui/button'

import { threadsOptions } from '../queries'
import { DeleteThread } from './delete-thread'

type ThreadListProps = {
  courseId: CourseId
  threadId: AiThreadId | undefined
  onSelect: (threadId: AiThreadId | undefined) => void
}

/** The caller's threads of the course, newest activity first (B-AI-12). */
export function ThreadList({ courseId, threadId, onSelect }: ThreadListProps) {
  const { data: threads } = useSuspenseQuery(threadsOptions(courseId))
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">{m.ai_threads()}</h3>
        <Button variant="ghost" size="sm" onClick={() => onSelect(undefined)}>
          <Plus data-icon="inline-start" aria-hidden />
          {m.ai_new_thread()}
        </Button>
      </div>
      {threads.length === 0 ? (
        <p className="text-sm text-muted-foreground">{m.ai_threads_empty()}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {threads.map(thread => {
            const title = thread.title ?? (thread.last_message_preview || m.ai_thread_untitled())
            return (
              <li key={thread.id} className="flex items-center gap-1">
                <Button
                  variant={thread.id === threadId ? 'secondary' : 'ghost'}
                  aria-current={thread.id === threadId ? 'true' : undefined}
                  className="h-auto min-w-0 flex-1 flex-col items-start gap-0 py-1 text-left"
                  onClick={() => onSelect(thread.id)}
                >
                  <span className="w-full truncate">{title}</span>
                  <span className="text-xs font-normal text-muted-foreground">
                    {m.ai_thread_messages({ count: thread.message_count })} · {formatDate(thread.updated_at_unix)}
                  </span>
                </Button>
                <DeleteThread
                  courseId={courseId}
                  thread={thread}
                  title={title}
                  onDeleted={() => thread.id === threadId && onSelect(undefined)}
                />
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
