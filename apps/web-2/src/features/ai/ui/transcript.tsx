import { Suspense } from 'react'

import { MarkdownView } from '#/features/markdown'
import { m } from '#/paraglide/messages'

import type { Entry } from '../model/chat'
import { Citations } from './citations'

/** The thread's messages and the turn in flight (B-AI-09, B-AI-10); the streaming answer is a polite live region. */
export function Transcript({ entries }: { entries: Entry[] }) {
  if (entries.length === 0) return <p className="text-sm text-muted-foreground">{m.ai_chat_empty()}</p>
  return (
    <ol className="flex flex-col gap-gutter">
      {entries.map(entry => (
        <li
          key={entry.id}
          className={`flex flex-col gap-1.5 ${entry.role === 'user' ? 'border-s-2 ps-3 font-medium' : ''}`}
        >
          <p className="text-xs font-normal text-muted-foreground">
            {entry.role === 'user' ? m.ai_you() : m.ai_assistant()}
          </p>
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
      ))}
    </ol>
  )
}
