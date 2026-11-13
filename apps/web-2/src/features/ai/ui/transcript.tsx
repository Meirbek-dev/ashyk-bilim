import { Suspense } from 'react'

import { MarkdownView } from '#/features/markdown'
import { m } from '#/paraglide/messages'
import { EmptyState } from '#/shared/components/empty-state'

import type { Entry } from '../model/chat'
import { Citations } from './citations'

/**
 * The thread's messages and the turn in flight (B-AI-09, B-AI-10); the streaming answer is a polite live region. A
 * question stands at the end of its line on a quiet field, as in any chat; the answer is text on the page under a small
 * «ИИ», so a long one reads as the lesson does.
 */
export function Transcript({ entries }: { entries: Entry[] }) {
  if (entries.length === 0) return <EmptyState>{m.ai_chat_empty()}</EmptyState>
  return (
    <ol className="flex flex-col gap-5">
      {entries.map(entry =>
        entry.role === 'user' ? (
          <li key={entry.id} className="flex flex-col items-end">
            <p className="sr-only">{m.ai_you()}</p>
            <div className="max-w-[88%] min-w-0 rounded-lg bg-muted/60 px-3 py-2">
              <Suspense fallback={<p className="text-sm whitespace-pre-wrap">{entry.content}</p>}>
                <MarkdownView content={entry.content} />
              </Suspense>
            </div>
          </li>
        ) : (
          <li key={entry.id} className="flex min-w-0 flex-col gap-1.5">
            <p className="text-xs text-muted-foreground">{m.ai_assistant()}</p>
            {entry.pending && !entry.content ? (
              <output className="text-sm text-muted-foreground">{m.ai_writing()}</output>
            ) : (
              <Suspense fallback={<p className="text-sm whitespace-pre-wrap">{entry.content}</p>}>
                <MarkdownView content={entry.content} live={entry.pending} />
              </Suspense>
            )}
            {entry.incomplete ? <p className="text-xs text-muted-foreground">{m.ai_incomplete()}</p> : null}
            <Citations citations={entry.citations} />
          </li>
        ),
      )}
    </ol>
  )
}
