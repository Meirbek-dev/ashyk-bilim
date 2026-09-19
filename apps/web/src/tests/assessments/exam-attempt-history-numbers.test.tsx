/** @vitest-environment jsdom */
// BUG-184: the attempt history numbered rows by position in the list that
// still held the open draft, so every row but the first was off by one.
// Rows carry the server's `attempt_number`.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it, vi } from 'vite-plus/test'

import ExamAttemptContent from '@/features/assessments/registry/exam/ExamAttemptContent'
import { DEFAULT_POLICY_VIEW } from '@/features/assessments/domain/policy'
import type { AttemptViewModel } from '@/features/assessments/domain/view-models'
import ruMessages from '@/messages/ru-RU.json'

const draft = { submission_uuid: 's3', id: 's3', attempt_number: 3, status: 'DRAFT', answered_count: 0 }
const submissions = [
  draft,
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

vi.mock('@/hooks/useContributorStatus', () => ({ useContributorStatus: () => ({ contributorStatus: null }) }))
vi.mock('@/features/assessments/shell', () => ({ useAttemptShellControls: () => undefined }))
vi.mock('@/features/assessments/registry/exam/ExamQuestionCard', () => ({ default: () => <div>question</div> }))
vi.mock('@/features/assessments/registry/exam/ExamQuestionNavigation', () => ({
  default: () => null,
  ExamQuestionNavigationMobile: () => null,
}))
vi.mock('@/features/assessments/hooks/useAssessmentSubmission', () => ({
  useAssessmentSubmission: () => ({
    isLoading: false,
    draft,
    submission: draft,
    submissions,
    answers: {},
    status: 'DRAFT',
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
  title: 'Тест',
  description: null,
  policy: DEFAULT_POLICY_VIEW,
  items: [
    {
      id: 'i1',
      item_uuid: 'i1',
      max_score: 1,
      body: { kind: 'CHOICE', prompt: 'Q', options: [{ id: 'o1', text: 'A', is_correct: true }], multiple: false },
    },
  ],
  canEdit: true,
  canSaveDraft: true,
  canSubmit: true,
  timerExpiresAt: null,
  isReturnedForRevision: false,
} as unknown as AttemptViewModel

describe('exam attempt history numbering', () => {
  it('labels rows with the server attempt number, not the list position', () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <NextIntlClientProvider locale="ru" messages={ruMessages} timeZone="UTC">
          <ExamAttemptContent activityUuid="act1" courseUuid="c1" vm={vm} />
        </NextIntlClientProvider>
      </QueryClientProvider>,
    )
    expect(screen.getByText('Последняя отправка')).toBeInTheDocument()
    expect(screen.getByText('Попытка №1')).toBeInTheDocument()
    expect(screen.queryByText('Попытка №2')).toBeNull()
  })
})
