/** @vitest-environment jsdom */
// BUG-028: the "Посмотреть ответы" row shows the earned score from the
// released `GradedItem`s and the timestamp is formatted for the app locale.
// Critic 9 T5: each row also carries the localized verdict (`feedback_code`)
// or the teacher's prose, and the headline percent uses the same number
// format as the breakdown («66,67%» / «3,33 / 10», never «66.67%»).
// UX-035: the wire breakdown is the item's share of 100; the row shows the
// item's own points («1 / 1», «10 / 10»), the number the attempt card names.
// UX-034: a capped retake carries the cap note next to the retry control.

import { fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it } from 'vite-plus/test'

import AttemptResultCard from '@/features/assessments/shell/AttemptResultCard'
import { DEFAULT_POLICY_VIEW } from '@/features/assessments/domain/policy'
import type { AttemptViewModel } from '@/features/assessments/domain/view-models'
import ruMessages from '@/messages/ru-RU.json'

const itemId = '01a091a1-afdd-7607-b09a-e42c0f895903'
const matchingId = '01a091a1-afdd-7607-b09a-e42c0f895904'
const prose = '01a091a1-afdd-7607-b09a-e42c0f895905'

const vm = {
  kind: 'TYPE_CUSTOM',
  title: 'Викторина 1',
  isResultVisible: true,
  isReturnedForRevision: false,
  canStartRevision: false,
  canSubmit: false,
  score: { percent: 66.67, source: 'final' },
  startedAt: '2026-09-11T18:04:39.000Z',
  policy: DEFAULT_POLICY_VIEW,
  items: [
    { id: itemId, item_uuid: itemId, order: 0, kind: 'CHOICE', title: 'Вопрос', max_score: 1 },
    { id: matchingId, item_uuid: matchingId, order: 1, kind: 'MATCHING', title: 'Столицы', max_score: 3 },
    { id: prose, item_uuid: prose, order: 2, kind: 'OPEN_TEXT', title: 'Эссе', max_score: 10 },
  ],
  itemScores: {
    [itemId]: { item_id: itemId, score: 100, max_score: 100, correct: true, feedback_code: 'correct' },
    [matchingId]: {
      item_id: matchingId,
      score: 66.67,
      max_score: 100,
      correct: false,
      feedback_code: 'pairs-matched',
      feedback_params: { correct: 2, total: 3 },
    },
    [prose]: { item_id: prose, score: 33.33, max_score: 33.33, feedback: 'Хорошо, но раскройте вывод.' },
  },
} as unknown as AttemptViewModel

describe('AttemptResultCard breakdown (BUG-028)', () => {
  it('shows the earned score next to the max score', () => {
    render(
      <NextIntlClientProvider locale="ru" messages={ruMessages} timeZone="UTC">
        <AttemptResultCard vm={vm} />
      </NextIntlClientProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Посмотреть ответы' }))
    expect(screen.getByTestId(`item-score-${itemId}`)).toHaveTextContent('1 / 1')
    expect(screen.getByTestId(`item-score-${matchingId}`)).toHaveTextContent('2 / 3')
    expect(screen.getByTestId(`item-score-${prose}`)).toHaveTextContent('10 / 10')
    // Headline and rows share one number format.
    expect(screen.getByText(/· 66,67%/)).toBeInTheDocument()
    expect(screen.queryByText(/66\.67/)).toBeNull()
    // Verdicts: auto-grader codes localized, teacher prose as-is.
    expect(screen.getByTestId(`item-verdict-${itemId}`)).toHaveTextContent('Верно')
    expect(screen.getByTestId(`item-verdict-${matchingId}`)).toHaveTextContent('Совпало пар: 2/3')
    expect(screen.getByTestId(`item-verdict-${prose}`)).toHaveTextContent('Хорошо, но раскройте вывод.')
    // ru date, not en-US "9/11/2026, 6:04:39 PM"
    expect(screen.queryByText(/9\/11\/2026/)).toBeNull()
    expect(screen.getByText(/11 сент\. 2026 г\./)).toBeInTheDocument()
  })

  it('names the score cap on a penalised retake (UX-034)', () => {
    render(
      <NextIntlClientProvider locale="ru" messages={ruMessages} timeZone="UTC">
        <AttemptResultCard vm={{ ...vm, canSubmit: true, nextAttemptCapPercent: 80 }} onRetry={() => undefined} />
      </NextIntlClientProvider>,
    )
    expect(screen.getByTestId('attempt-cap-note')).toHaveTextContent('Максимальный балл за эту попытку: 80 %')
  })

  // UX-060 / UX-063: a 48 % beside a full breakdown says why (late penalty,
  // attempt cap, auto-submit), and the teacher's overall comment is shown.
  it('explains penalties, auto-submit and renders the general feedback', () => {
    render(
      <NextIntlClientProvider locale="ru" messages={ruMessages} timeZone="UTC">
        <AttemptResultCard
          vm={{
            ...vm,
            score: { percent: 48, source: 'final' },
            latePenaltyPct: 20,
            attemptCapPercent: 80,
            autoSubmitReason: 'time_expired',
            generalFeedback: 'Хорошо, но коротко',
          }}
        />
      </NextIntlClientProvider>,
    )
    const notes = screen.getByTestId('score-adjustments')
    expect(notes).toHaveTextContent('время истекло')
    expect(notes).toHaveTextContent('Штраф за опоздание: −20 %')
    expect(notes).toHaveTextContent('Максимальный балл за эту попытку: 80 %')
    expect(screen.getByTestId('general-feedback')).toHaveTextContent('Хорошо, но коротко')
  })

  it('shows nothing extra for a plain released attempt', () => {
    render(
      <NextIntlClientProvider locale="ru" messages={ruMessages} timeZone="UTC">
        <AttemptResultCard
          vm={{ ...vm, latePenaltyPct: null, attemptCapPercent: null, autoSubmitReason: null, generalFeedback: null }}
        />
      </NextIntlClientProvider>,
    )
    expect(screen.queryByTestId('score-adjustments')).toBeNull()
    expect(screen.queryByTestId('general-feedback')).toBeNull()
  })
})
