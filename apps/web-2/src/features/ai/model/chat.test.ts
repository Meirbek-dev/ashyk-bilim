import { describe, expect, test } from 'vite-plus/test'

import type { QaMessage } from '#/shared/api/gen/types.gen'

import { finishedThreadId, STOPPED, transcript, turnReducer, type Turn, type TurnAction } from './chat'

const COURSE = '0190a5d2-0000-7000-8000-0000000000c1'
const THREAD = '0190a5d2-0000-7000-8000-0000000000d1'
const TURN = 'turn-1'

const message = (id: string, role: QaMessage['role'], content: string, turn: string | null = null): QaMessage => ({
  id,
  role,
  content,
  client_turn_id: turn,
  citations: { citations: [] },
  confidence: null,
  course_id: COURSE,
  created_at_unix: 1_760_000_000,
  metadata: {},
  thread_id: THREAD,
  user_id: null,
})

const play = (...actions: TurnAction[]): Turn | null => actions.reduce(turnReducer, null as Turn | null)
const ask: TurnAction = { type: 'ask', clientTurnId: TURN, question: 'Что такое цикл?' }

describe('turnReducer', () => {
  test('B-AI-09 deltas assemble the answer; the tool result carries the citations; RUN_FINISHED names the thread', () => {
    const citations = JSON.stringify({ citations: [{ citation_id: 'c1', label: 'Глава 1', source_type: 'activity' }] })
    const turn = play(
      ask,
      { type: 'delta', text: 'Цикл - ' },
      { type: 'delta', text: 'повтор.' },
      { type: 'tool-result', content: citations },
      { type: 'finished', result: { thread_id: THREAD, message_id: 'm1' } },
    )
    expect(turn).toMatchObject({ answer: 'Цикл - повтор.', status: 'done', threadId: THREAD })
    expect(turn?.citations.map(citation => citation.label)).toEqual(['Глава 1'])
  })

  test('B-AI-09 a tool result that is not citations JSON is ignored', () => {
    expect(play(ask, { type: 'tool-result', content: 'not json' })?.citations).toEqual([])
    expect(finishedThreadId({ thread_id: 'not-a-uuid' })).toBeNull()
  })

  test('B-AI-11 a failure keeps the turn id for the retry', () => {
    const failed = play(ask, { type: 'delta', text: 'Част' }, { type: 'failed', code: 'ai-budget-exhausted' })
    expect(failed).toMatchObject({ status: 'failed', errorCode: 'ai-budget-exhausted', clientTurnId: TURN })
  })
})

describe('transcript', () => {
  test('B-AI-10 the turn in flight follows the saved thread while it streams', () => {
    const saved = [message('m1', 'user', 'Раньше'), message('m2', 'assistant', 'Ответ')]
    const entries = transcript(saved, play(ask, { type: 'delta', text: 'Пишу' }))
    expect(entries.map(entry => [entry.role, entry.content, entry.pending])).toEqual([
      ['user', 'Раньше', false],
      ['assistant', 'Ответ', false],
      ['user', 'Что такое цикл?', false],
      ['assistant', 'Пишу', true],
    ])
  })

  test('B-AI-10 the turn stays after finishing until the saved thread holds its client_turn_id (UX-299)', () => {
    const done = play(ask, { type: 'delta', text: 'Ответ' }, { type: 'finished', result: { thread_id: THREAD } })
    expect(transcript([], done)).toHaveLength(2)
    const saved = [message('m3', 'user', 'Что такое цикл?', TURN), message('m4', 'assistant', 'Ответ', TURN)]
    expect(transcript(saved, done).map(entry => entry.id)).toEqual(['m3', 'm4'])
  })

  test('B-AI-10 a stopped answer is kept and marked unfinished; a turn with no answer shows the question only', () => {
    const stopped = transcript([], play(ask, { type: 'delta', text: 'Нача' }, { type: 'failed', code: STOPPED }))
    expect(stopped.at(-1)).toMatchObject({ content: 'Нача', incomplete: true, pending: false })
    expect(transcript([], play(ask, { type: 'failed', code: 'ai-disabled' }))).toHaveLength(1)
  })

  test('B-AI-10 a saved answer cut short is marked unfinished', () => {
    const cut = { ...message('m5', 'assistant', 'Обрыв'), metadata: { incomplete: true } }
    expect(transcript([cut], null)[0]?.incomplete).toBe(true)
  })
})
