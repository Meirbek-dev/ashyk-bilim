/** @vitest-environment jsdom */
// UX-140: the retake entry page said «Балл 0%» from the latest completed
// submission while the result card on the same activity said «100%» (the
// projection). Both read the grade of record through `gradeOfRecord`.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it, vi } from 'vite-plus/test'

import ExamAttemptContent from '@/features/assessments/registry/exam/ExamAttemptContent'
import { DEFAULT_POLICY_VIEW } from '@/features/assessments/domain/policy'
import type { AttemptViewModel } from '@/features/assessments/domain/view-models'
import ruMessages from '@/messages/ru-RU.json'

const submissions = [
  { submission_uuid: 's2', id: 's2', attempt_number: 2, status: 'PUBLISHED', final_score: 0, submitted_at: '2026-09-12T10:00:00Z' },
  { submission_uuid: 's1', id: 's1', attempt_number: 1, status: 'PUBLISHED', final_score: 100, submitted_at: '2026-09-12T09:00:00Z' },
]

vi.mock('@/hooks/useContributorStatus', () => ({ useContributorStatus: () => ({ contributorStatus: null }) }))
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
  items: [{ id: 'i1', item_uuid: 'i1', max_score: 1, body: { kind: 'CHOICE', prompt: 'Q', options: [], multiple: false } }],
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

describe('exam entry panel grade of record', () => {
  it('shows the projection score (best attempt), not the latest attempt', () => {
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
    expect(screen.getByText('Результат доступен')).toBeInTheDocument()
    expect(screen.getByText('Балл').parentElement).toHaveTextContent(/^Балл100%$/)
    expect(screen.getByText('Отлично')).toBeInTheDocument()
  })
})
