import { Sparkles } from 'lucide-react'
import { Suspense } from 'react'

import { MarkdownView } from '#/features/markdown'
import { m } from '#/paraglide/messages'
import { Spinner } from '#/shared/ui/spinner'

import type { Entry } from '../model/chat'
import { Citations } from './citations'
import { Suggestion } from './suggestion'

const starters = [m.ai_starter_explain, m.ai_starter_summary, m.ai_starter_quiz]

type TranscriptProps = {
  entries: Entry[]
  /** Asks a starter question of the empty thread. */
  onAsk: (question: string) => void
  pending: boolean
}

/**
 * The thread's messages and the turn in flight (B-AI-09, B-AI-10); the streaming answer is a polite live region. A
 * question stands at the end of its line on a quiet field, as in any chat; the answer is text on the page under a small
 * «ИИ», so a long one reads as the lesson does. An empty thread says what the assistant is for and offers three
 * questions to start with: a bare box asked the learner to invent the first one.
 */
export function Transcript({ entries, onAsk, pending }: TranscriptProps) {
  if (entries.length === 0)
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <h3 className="text-lg font-semibold">{m.ai_welcome_title()}</h3>
          <p className="text-sm text-pretty text-muted-foreground">{m.ai_chat_empty()}</p>
        </div>
        <ul className="flex flex-col gap-1.5">
          {starters.map(starter => (
            <li key={starter()}>
              <Suggestion disabled={pending} onClick={() => onAsk(starter())}>
                {starter()}
              </Suggestion>
            </li>
          ))}
        </ul>
      </div>
    )
  return (
    <ol className="flex flex-col gap-6">
      {entries.map(entry =>
        entry.role === 'user' ? (
          <li key={entry.id} className="flex flex-col items-end">
            <p className="sr-only">{m.ai_you()}</p>
            <div className="max-w-[88%] min-w-0 rounded-2xl rounded-br-sm bg-muted px-3.5 py-2">
              <Suspense fallback={<p className="text-sm whitespace-pre-wrap">{entry.content}</p>}>
                <MarkdownView content={entry.content} />
              </Suspense>
            </div>
          </li>
        ) : (
          <li key={entry.id} className="flex min-w-0 flex-col gap-2">
            <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Sparkles aria-hidden className="size-3.5 text-highlight" />
              {m.ai_assistant()}
            </p>
            {entry.pending && !entry.content ? (
              <output className="flex items-center gap-2 text-sm text-muted-foreground">
                <Spinner aria-hidden />
                {m.ai_writing()}
              </output>
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
