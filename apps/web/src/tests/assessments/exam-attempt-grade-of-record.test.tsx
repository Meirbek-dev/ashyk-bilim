/** @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it, vi } from 'vite-plus/test'

import ExamAttemptContent from '@/features/assessments/registry/exam/ExamAttemptContent'
import { DEFAULT_POLICY_VIEW } from '@/features/assessments/domain/policy'
import { submitVerdict } from '@/features/assessments/domain/grade-of-record'
import type { AttemptViewModel } from '@/features/assessments/domain/view-models'
import ruMessages from '@/messages/ru-RU.json'

const submissions = [
  {
    submission_uuid: 's2',
    id: 's2',
    attempt_number: 2,
    status: 'PUBLISHED',
    final_score: 0,
    submitted_at: '2026-09-12T10:00:00Z',
  },
  {
    submission_uuid: 's1',
    id: 's1',
    attempt_number: 1,
    status: 'PUBLISHED',
    final_score: 100,
    submitted_at: '2026-09-12T09:00:00Z',
  },
]

vi.mock('@/features/assessments/shell', () => ({ useAttemptShellControls: () => undefined }))
vi.mock('@/features/assessments/hooks/useAssessmentSubmission', () => ({
  useAssessmentSubmission: () => ({
    isLoading: false,
    draft: null,
    submission: submissions[0],
    submissions,
    answers: {},
    status: 'PUBLISHED',
    saveState: 'saved',
    isSaving: false,
    isSubmitting: false,
    conflict: null,
    setItemAnswer: vi.fn(),
    save: vi.fn(),
    submit: vi.fn(),
  }),
}))

const vm = {
  assessmentUuid: 'a1',
  activityUuid: 'act1',
  title: 'Тест',
  description: null,
  policy: DEFAULT_POLICY_VIEW,
  items: [
    { id: 'i1', item_uuid: 'i1', max_score: 1, body: { kind: 'CHOICE', prompt: 'Q', options: [], multiple: false } },
  ],
  canEdit: true,
  canSaveDraft: true,
  canSubmit: true,
  timerExpiresAt: null,
  isReturnedForRevision: false,
  isResultVisible: true,
  score: { percent: 0, source: 'final' },
  attemptReviews: [
    { attemptNumber: 2, percent: 0, itemScores: {}, generalFeedback: null, annulled: false },
    { attemptNumber: 1, percent: 100, itemScores: {}, generalFeedback: 'Отлично', annulled: false },
  ],
} as unknown as AttemptViewModel

// The entry and result screens are InlineAssessmentWorkspace's. Between a submit
// and the attempt-state refetch the attempt shell has no draft: it used to flash
// a second entry screen with «Начать экзамен» there - now only a loader.
describe('exam attempt without an open draft', () => {
  it('renders no second entry screen', () => {
    const client = new QueryClient()
    client.setQueryData(['learner-course', 'c1', 'state'], {
      outline: [{ activities: [{ id: 'act1', score: 100, passed: true }] }],
    })
    render(
      <QueryClientProvider client={client}>
        <NextIntlClientProvider locale="ru" messages={ruMessages} timeZone="UTC">
          <ExamAttemptContent activityUuid="act1" courseUuid="c1" vm={vm} />
        </NextIntlClientProvider>
      </QueryClientProvider>,
    )
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByText('Результат доступен')).toBeNull()
  })
})

// UX-224: a 50 % retake after a counted 100 % toasted «Тест не пройден: 50%»
// while the card said «Пройден · 100%» - the toast states the counted result.
describe('submit toast verdict', () => {
  it('is the counted result, with this attempt as a side note', () => {
    expect(submitVerdict(50, { score: 100, passed: true }, 60)).toEqual({ score: 100, passed: true, latest: 50 })
    expect(submitVerdict(80, { score: 80, passed: true }, 60)).toEqual({ score: 80, passed: true, latest: null })
    expect(submitVerdict(40, undefined, 60)).toEqual({ score: 40, passed: false, latest: null })
    expect(submitVerdict(null, { score: 100, passed: true }, 60)).toBeNull()
  })
})
