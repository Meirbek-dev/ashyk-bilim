/** @vitest-environment jsdom */
// Critic 9 F13: «Черновик восстановлен» appeared ~2 s into a brand-new attempt
// because the draft query refetches after the first autosave and
// `answered_count` turns positive. The banner is about a draft that existed
// BEFORE the attempt was opened, so it is decided once, on mount.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import ExamAttemptContent from '@/features/assessments/registry/exam/ExamAttemptContent'
import { DEFAULT_POLICY_VIEW } from '@/features/assessments/domain/policy'
import type { AttemptViewModel } from '@/features/assessments/domain/view-models'
import ruMessages from '@/messages/ru-RU.json'

const mocks = vi.hoisted(() => ({ draft: { submission_uuid: 's1', id: 's1', answered_count: 0 } as Record<string, unknown> }))

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
    draft: mocks.draft,
    submission: mocks.draft,
    submissions: [mocks.draft],
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

function renderAttempt() {
  const client = new QueryClient()
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="ru" messages={ruMessages} timeZone="UTC">
        <ExamAttemptContent activityUuid="act1" courseUuid="c1" vm={vm} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  const store = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
      clear: () => store.clear(),
    },
  })
  mocks.draft = { submission_uuid: 's1', id: 's1', answered_count: 0, updated_at: '2026-09-12T10:00:00Z' }
})

describe('resumed-draft banner', () => {
  it('stays hidden when the attempt was fresh on open, even after the first autosave lands', () => {
    const { rerender } = renderAttempt()
    expect(screen.queryByText('Черновик восстановлен')).toBeNull()

    // Autosave round-trip: the draft query now reports one answered item.
    mocks.draft = { ...mocks.draft, answered_count: 1 }
    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <NextIntlClientProvider locale="ru" messages={ruMessages} timeZone="UTC">
          <ExamAttemptContent activityUuid="act1" courseUuid="c1" vm={{ ...vm }} />
        </NextIntlClientProvider>
      </QueryClientProvider>,
    )
    expect(screen.queryByText('Черновик восстановлен')).toBeNull()
  })

  it('shows when the draft already had answers on open', () => {
    mocks.draft = { ...mocks.draft, answered_count: 2 }
    renderAttempt()
    expect(screen.getByText('Черновик восстановлен')).toBeInTheDocument()
  })
})
