/** @vitest-environment jsdom */
// Gauntlet: the outline sidebar ticked the quiz (projection: best attempt 100%,
// passed) while the result card said "Не пройдено · 0%" from the latest
// attempt alone. The card now follows the projection and notes the latest.
import { fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it } from 'vite-plus/test'

import AttemptResultCard from '@/features/assessments/shell/AttemptResultCard'
import { DEFAULT_POLICY_VIEW } from '@/features/assessments/domain/policy'
import type { AttemptViewModel } from '@/features/assessments/domain/view-models'
import type { LearnerCourseState } from '@/features/learner-course/api'
import ruMessages from '@/messages/ru-RU.json'

const vm = {
  kind: 'TYPE_CUSTOM',
  title: 'Викторина 1',
  isResultVisible: true,
  isReturnedForRevision: false,
  canStartRevision: false,
  canSubmit: true,
  disabledActionReasons: [],
  passingScore: 60,
  score: { percent: 0, source: 'final' },
  startedAt: null,
  policy: DEFAULT_POLICY_VIEW,
  items: [],
  itemScores: {},
} as unknown as AttemptViewModel

const activityState = {
  id: 'a1',
  title: 'Викторина 1',
  activity_type: 'quiz',
  required: true,
  state: 'passed',
  complete: true,
  score: 100,
  passed: true,
  is_late: false,
  available: true,
  allowed_actions: ['view_feedback'],
} as unknown as LearnerCourseState['outline'][number]['activities'][number]

const wrap = (node: React.ReactNode) => (
  <NextIntlClientProvider locale="ru" messages={ruMessages} timeZone="UTC">
    {node}
  </NextIntlClientProvider>
)

describe('AttemptResultCard vs progress projection', () => {
  it('reports the projection (passed, best score) and notes the latest attempt', () => {
    render(wrap(<AttemptResultCard vm={vm} activityState={activityState} />))
    expect(screen.getByText('Пройдено')).toBeInTheDocument()
    expect(screen.queryByText('Не пройдено')).toBeNull()
    expect(screen.getByText(/· 100%/)).toBeInTheDocument()
    expect(screen.getByText('Последняя попытка: 0%')).toBeInTheDocument()
  })

  // UX-116: the review belongs to the grade-of-record attempt (2, 76 %), not
  // the latest annulled one (3, 0 %) whose breakdown is no verdict.
  it('reviews the grade-of-record attempt and marks an annulled one', () => {
    const itemId = '01a091a1-afdd-7607-b09a-e42c0f895903'
    const item = { item_id: itemId, score: 100, max_score: 100, correct: true, feedback_code: 'correct' }
    const reviewVm = {
      ...vm,
      items: [{ id: itemId, item_uuid: itemId, order: 0, kind: 'CHOICE', title: 'Вопрос', max_score: 10 }],
      itemScores: { [itemId]: item },
      autoSubmitReason: 'integrity_violation',
      generalFeedback: null,
      attemptReviews: [
        { attemptNumber: 3, percent: 0, itemScores: { [itemId]: item }, generalFeedback: null, annulled: true },
        { attemptNumber: 2, percent: 76, itemScores: { [itemId]: item }, generalFeedback: 'Молодец', annulled: false },
        { attemptNumber: 1, percent: 40, itemScores: { [itemId]: { ...item, score: 40 } }, generalFeedback: null, annulled: false },
      ],
    } as unknown as AttemptViewModel
    render(wrap(<AttemptResultCard vm={reviewVm} activityState={{ ...activityState, score: 76 }} />))

    expect(screen.getByTestId('record-attempt')).toHaveTextContent('Учитывается попытка 2 · 76%')
    expect(screen.getByTestId('general-feedback')).toHaveTextContent('Молодец')
    expect(screen.getByRole('button', { name: 'Попытка 2 · 76%' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Посмотреть ответы' }))
    expect(screen.getByTestId(`item-score-${itemId}`)).toHaveTextContent('10 / 10')

    fireEvent.click(screen.getByRole('button', { name: 'Попытка 3 · 0%' }))
    expect(screen.getByTestId('attempt-annulled')).toHaveTextContent('Попытка аннулирована')
    expect(screen.queryByTestId(`item-score-${itemId}`)).toBeNull()
    expect(screen.queryByTestId('general-feedback')).toBeNull()
  })

  it('falls back to the latest attempt against the effective passing score', () => {
    render(wrap(<AttemptResultCard vm={{ ...vm, score: { percent: 70, source: 'final' }, passingScore: 80 }} />))
    expect(screen.getByText('Не пройдено')).toBeInTheDocument()
  })
})
