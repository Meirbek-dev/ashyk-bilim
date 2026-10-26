import { describe, expect, test } from 'vite-plus/test'

import { m } from '#/paraglide/messages'
import type { AssessmentItem } from '#/shared/api/gen/types.gen'
import { renderInRouter } from '#/shared/components/testing'

import { ResultBreakdown } from './result-breakdown'

const item = (title: string, prompt: string): AssessmentItem => ({
  id: title,
  body: { kind: 'choice', explanation: null, variant: 'single_choice', prompt, options: [{ id: 'o1', text: 'VR' }] },
  kind: 'choice',
  max_score: 1,
  metadata: { difficulty: null, estimated_minutes: null, section_label: null },
  position: 1,
  title,
  assessment_version: 1,
})

describe('ResultBreakdown', () => {
  test('B-ATT-18 a question worded only in its prompt (migrated «сұрақ:») shows the wording', async () => {
    const items = [item('сұрақ:', 'Иммерсивті технологияға жатады'), item('Same text', 'Same text')]
    const graded = items.map(entry => ({
      item_id: entry.id,
      score: 0,
      max_score: 1,
      correct: null,
      correct_answer: null,
      user_answer: { kind: 'choice' as const, selected: ['o1'] },
    }))
    const screen = await renderInRouter(<ResultBreakdown items={items} graded={graded} />)
    await expect.element(screen.getByText('Иммерсивті технологияға жатады')).toBeInTheDocument()
    // A prompt equal to the title is not repeated.
    expect(screen.getByText('Same text', { exact: false }).elements()).toHaveLength(1)
  })
})

test('B-ATT-26 an empty answer reads «not answered», and the review opens with the tally', async () => {
  const items = [item('Q1', 'Q1'), item('Q2', 'Q2'), item('Q3', 'Q3')]
  const graded = [
    {
      item_id: 'Q1',
      score: 1,
      max_score: 1,
      correct: true,
      correct_answer: null,
      user_answer: { kind: 'choice' as const, selected: ['o1'] },
    },
    {
      item_id: 'Q2',
      score: 0,
      max_score: 1,
      correct: false,
      correct_answer: null,
      user_answer: { kind: 'choice' as const, selected: ['o1'] },
    },
    { item_id: 'Q3', score: 0, max_score: 1, correct: false, correct_answer: null, user_answer: null },
  ]
  const screen = await renderInRouter(<ResultBreakdown items={items} graded={graded} />)
  const tally = `${m.attempt_correct()}: 1 · ${m.attempt_incorrect()}: 1 · ${m.attempt_verdict_unanswered()}: 1`
  await expect.element(screen.getByText(tally)).toBeInTheDocument()
  expect(screen.getByText(m.attempt_verdict_unanswered(), { exact: true }).elements()).toHaveLength(1)
  expect(screen.getByText(m.attempt_incorrect(), { exact: true }).elements()).toHaveLength(1)
})

test('B-ATT-18 the author’s explanation follows the correct answer when the server sends it', async () => {
  const items = [item('Q1', 'Q1'), item('Q2', 'Q2')]
  const graded = [
    {
      item_id: 'Q1',
      score: 0,
      max_score: 1,
      correct: false,
      correct_answer: ['o1'],
      explanation: 'Кавычки делают **строку**.',
      user_answer: { kind: 'choice' as const, selected: [] },
    },
    { item_id: 'Q2', score: 1, max_score: 1, correct: true, correct_answer: ['o1'], user_answer: null },
  ]
  const screen = await renderInRouter(<ResultBreakdown items={items} graded={graded} />)
  await expect.element(screen.getByText('строку')).toBeInTheDocument()
  expect(screen.getByText(m.attempt_explanation(), { exact: true }).elements()).toHaveLength(1)
})
