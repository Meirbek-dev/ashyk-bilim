/** @vitest-environment jsdom */
// Gauntlet: the outline sidebar ticked the quiz (projection: best attempt 100%,
// passed) while the result card said "Не пройдено · 0%" from the latest
// attempt alone. The card now follows the projection and notes the latest.
import { render, screen } from '@testing-library/react'
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

  it('falls back to the latest attempt against the effective passing score', () => {
    render(wrap(<AttemptResultCard vm={{ ...vm, score: { percent: 70, source: 'final' }, passingScore: 80 }} />))
    expect(screen.getByText('Не пройдено')).toBeInTheDocument()
  })
})
