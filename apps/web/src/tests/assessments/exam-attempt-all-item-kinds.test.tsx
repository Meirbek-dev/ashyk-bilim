/** @vitest-environment jsdom */
// BUG-110: the exam attempt dropped every non choice/matching item — an
// assessment with a choice and an essay showed one question, the confirm
// dialog counted one, and the essay was submitted blank. Every item kind the
// server returns is a question with an answer control.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import ExamAttemptContent from '@/features/assessments/registry/exam/ExamAttemptContent'
import { DEFAULT_POLICY_VIEW } from '@/features/assessments/domain/policy'
import type { AttemptViewModel } from '@/features/assessments/domain/view-models'
import ruMessages from '@/messages/ru-RU.json'

const mocks = vi.hoisted(() => ({
  setItemAnswer: vi.fn(),
  answers: {} as Record<string, unknown>,
}))

vi.mock('@/hooks/useContributorStatus', () => ({ useContributorStatus: () => ({ contributorStatus: null }) }))
vi.mock('@/features/assessments/shell', () => ({ useAttemptShellControls: () => undefined }))
vi.mock('@/features/assessments/registry/exam/ExamQuestionNavigation', () => ({
  default: () => null,
  ExamQuestionNavigationMobile: () => null,
}))
vi.mock('@/features/content-markdown', () => ({
  MarkdownContent: ({ content }: { content: string }) => <p>{content}</p>,
}))
vi.mock('@/features/assessments/hooks/useAssessmentSubmission', () => ({
  useAssessmentSubmission: () => ({
    isLoading: false,
    draft: { submission_uuid: 's1', id: 's1', answered_count: 0, updated_at: '2026-09-12T10:00:00Z' },
    submission: null,
    submissions: [],
    answers: mocks.answers,
    status: 'DRAFT',
    saveState: 'saved',
    isSaving: false,
    isSubmitting: false,
    conflict: null,
    setItemAnswer: mocks.setItemAnswer,
    save: vi.fn(),
    submit: vi.fn(),
  }),
}))

const vm = {
  assessmentUuid: 'a1',
  title: 'Экзамен',
  description: null,
  policy: DEFAULT_POLICY_VIEW,
  items: [
    {
      id: 'i1',
      item_uuid: 'i1',
      kind: 'CHOICE',
      max_score: 1,
      body: { kind: 'CHOICE', prompt: 'Выбор', options: [{ id: 'o1', text: 'A', is_correct: true }], multiple: false },
    },
    { id: 'i2', item_uuid: 'i2', kind: 'OPEN_TEXT', max_score: 10, body: { kind: 'OPEN_TEXT', prompt: 'Эссе' } },
  ],
  canEdit: true,
  canSaveDraft: true,
  canSubmit: true,
  timerExpiresAt: null,
  isReturnedForRevision: false,
} as unknown as AttemptViewModel

beforeEach(() => {
  const store = new Map<string, string>([['exam-view-mode', 'SCROLL']])
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
      clear: () => store.clear(),
    },
  })
  globalThis.IntersectionObserver = class {
    observe() {}
    disconnect() {}
  } as unknown as typeof IntersectionObserver
  mocks.setItemAnswer.mockReset()
})

describe('exam attempt renders every item kind (BUG-110)', () => {
  it('shows the essay next to the choice and records its answer', () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <NextIntlClientProvider locale="ru" messages={ruMessages} timeZone="UTC">
          <ExamAttemptContent activityUuid="act1" courseUuid="c1" vm={vm} />
        </NextIntlClientProvider>
      </QueryClientProvider>,
    )
    expect(screen.getAllByRole('group')).toHaveLength(2)
    expect(screen.getByText('Эссе')).toBeInTheDocument()

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'мой ответ' } })
    expect(mocks.setItemAnswer).toHaveBeenCalledWith('i2', { kind: 'OPEN_TEXT', text: 'мой ответ' })
  })
})
