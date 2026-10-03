import * as v from 'valibot'

import type { AiThreadId, Citation, QaMessage } from '#/shared/api/gen/types.gen'
import { vAiThreadId, vCitation } from '#/shared/api/gen/valibot.gen'

/**
 * A Q&A turn while it streams (`POST /ai/qa/{course_id}/chat`), and the transcript it joins. Pure: the hook feeds
 * it the AG-UI events of the turn.
 */
export type Turn = {
  /** Created when the question is sent; a retry sends it again and the server replays a stored answer. */
  clientTurnId: string
  question: string
  answer: string
  citations: Citation[]
  status: 'streaming' | 'done' | 'failed'
  errorCode: string | null
  /** `RUN_FINISHED.result.thread_id`: the thread the turn was saved to (a new one for the first question). */
  threadId: AiThreadId | null
}

export type TurnAction =
  | { type: 'ask'; clientTurnId: string; question: string }
  | { type: 'delta'; text: string }
  | { type: 'tool-result'; content: string }
  | { type: 'finished'; result: unknown }
  | { type: 'failed'; code: string }

// Shapes the server writes into AG-UI fields (`ai_agents.rs`); the contract types the stream as text.
const vCitationsResult = v.object({ citations: v.array(vCitation) })
const vFinishedResult = v.object({ thread_id: vAiThreadId })

/** The failure code of a turn the learner stopped: the answer is kept and marked unfinished, no error text. */
export const STOPPED = 'stopped'

/** `RUN_FINISHED.result.thread_id`: the thread the turn was saved to. */
export function finishedThreadId(result: unknown): AiThreadId | null {
  const parsed = v.safeParse(vFinishedResult, result)
  return parsed.success ? parsed.output.thread_id : null
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

export function turnReducer(turn: Turn | null, action: TurnAction): Turn | null {
  if (action.type === 'ask') {
    const { clientTurnId, question } = action
    return { clientTurnId, question, answer: '', citations: [], status: 'streaming', errorCode: null, threadId: null }
  }
  if (!turn) return turn
  switch (action.type) {
    case 'delta':
      return { ...turn, answer: turn.answer + action.text }
    case 'tool-result': {
      const result = v.safeParse(vCitationsResult, parseJson(action.content))
      return result.success ? { ...turn, citations: result.output.citations } : turn
    }
    case 'finished':
      return { ...turn, status: 'done', threadId: finishedThreadId(action.result) ?? turn.threadId }
    case 'failed':
      return { ...turn, status: 'failed', errorCode: action.code }
    default:
      return turn
  }
}

export type Entry = {
  id: string
  role: 'user' | 'assistant'
  content: string
  citations: Citation[]
  /** The streaming answer: announced politely, shows "Writing...". */
  pending: boolean
  /** The saved answer was cut short (`metadata.incomplete`). */
  incomplete: boolean
}

const saved = (message: QaMessage): Entry => ({
  id: message.id,
  role: message.role,
  content: message.content,
  citations: message.citations.citations ?? [],
  pending: false,
  incomplete: message.metadata.incomplete === true,
})

/**
 * The transcript: the saved thread, then the turn in flight. The turn stays until the saved thread holds its
 * `client_turn_id` (UX-299: dropping it before the thread is read again flashed an empty panel).
 */
export function transcript(messages: QaMessage[], turn: Turn | null): Entry[] {
  const entries = messages.map(saved)
  if (!turn || messages.some(message => message.client_turn_id === turn.clientTurnId)) return entries
  const question: Entry = {
    id: `${turn.clientTurnId}-q`,
    role: 'user',
    content: turn.question,
    citations: [],
    pending: false,
    incomplete: false,
  }
  if (!turn.answer && turn.status !== 'streaming') return [...entries, question]
  const answer: Entry = {
    id: `${turn.clientTurnId}-a`,
    role: 'assistant',
    content: turn.answer,
    citations: turn.citations,
    pending: turn.status === 'streaming',
    incomplete: turn.status === 'failed',
  }
  return [...entries, question, answer]
}
