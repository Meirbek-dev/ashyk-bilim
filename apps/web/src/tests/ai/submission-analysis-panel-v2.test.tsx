/** @vitest-environment jsdom */

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import { APIError } from '@/lib/api/assertSuccess'

const mocks = vi.hoisted(() => ({
  apiJson: vi.fn(),
}))

vi.mock('@/lib/api-client', () => ({ apiJson: mocks.apiJson }))

vi.mock('next-intl', () => ({
  useFormatter: () => ({ dateTime: (date: Date) => date.toISOString(), number: (value: number) => String(value) }),
  useLocale: () => 'ru-RU',
  useTranslations: (namespace: string) => {
    const t = (key: string) => `${namespace}.${key}`
    t.has = () => false
    return t
  },
}))

vi.mock('@/features/ai-experience', async importOriginal => ({
  ...(await importOriginal<typeof import('@/features/ai-experience')>()),
  useAIRunController: () => ({
    cancel: vi.fn(),
    error: null,
    latestArtifact: undefined,
    pending: false,
    start: vi.fn(),
    state: 'idle',
  }),
}))

import { SubmissionAIEntry } from '@/features/submission-analysis/components/submission-ai-entry'

const SUBMISSION_ID = '01a091c9-0199-7e95-9346-d1ae4fc9823e'

/** Verbatim `GET /ai/submission-analysis/{submission}/latest` answer from the Rust server (draft mode). */
const wire = {
  id: '01a09221-0892-7eb4-b204-7047c305b883',
  submission_id: SUBMISSION_ID,
  run_id: '01a09221-082f-7a96-a640-56c5820d08e8',
  triggered_by: '01a0910c-796a-7bf1-8475-cb7d3130f81a',
  status: 'complete',
  language: 'auto',
  gap_count: 1,
  analysis: {
    citations: [
      {
        citation_id: 'submission-draft',
        confidence: 0.4,
        excerpt: 'Черновик анализа решения создан без доступа к модели.',
        label: 'Контекст решения',
        source_type: 'submission',
      },
    ],
    confidence: 'low',
    knowledge_gaps: [
      {
        concept: 'Ход решения',
        evidence: 'Анализ с использованием провайдера не запускался.',
        remediation_goal: 'Проверьте отправленную работу и вручную выявите первое заблуждение.',
        severity: 'medium',
      },
    ],
    language: 'auto',
    next_action: 'Включите анализ ИИ.',
    summary: 'ИИ еще не включен.',
  },
  evidence: { citations: [] },
  model_name: 'draft-mode',
  created_at_unix: 1_789_158_034,
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

function answerLatest(handler: (parse: (value: unknown) => unknown) => unknown) {
  mocks.apiJson.mockImplementation((_path: string, _init: unknown, parse: (value: unknown) => unknown) =>
    Promise.resolve().then(() => handler(parse)),
  )
}

describe('SubmissionAIEntry on the v2 wire', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the v2 `analysis` fields and drafts feedback from them', async () => {
    answerLatest(parse => parse(wire))
    const onDraftFeedback = vi.fn()

    render(<SubmissionAIEntry submissionUuid={SUBMISSION_ID} onDraftFeedback={onDraftFeedback} />, { wrapper })

    const gap = wire.analysis.knowledge_gaps[0]!
    expect(await screen.findByText(gap.concept)).toBeInTheDocument()
    expect(screen.getByText(gap.remediation_goal)).toBeInTheDocument()
    expect(screen.getByText(wire.analysis.summary)).toBeInTheDocument()
    expect(screen.getByText(wire.analysis.citations[0]!.label)).toBeInTheDocument()
    expect(mocks.apiJson).toHaveBeenCalledWith(
      `ai/submission-analysis/${SUBMISSION_ID}/latest`,
      undefined,
      expect.any(Function),
    )

    fireEvent.click(screen.getByText('AiExperience.submissionAIEntry.draftFeedback'))
    expect(onDraftFeedback).toHaveBeenCalledWith(
      `${wire.analysis.summary}\n\n- **${gap.concept}**: ${gap.remediation_goal}`,
    )
  })

  // UX-093: a non-empty feedback box is not replaced without a confirmation.
  it('asks before replacing existing feedback with the AI draft', async () => {
    answerLatest(parse => parse(wire))
    const onDraftFeedback = vi.fn()

    render(<SubmissionAIEntry submissionUuid={SUBMISSION_ID} hasFeedback onDraftFeedback={onDraftFeedback} />, {
      wrapper,
    })

    fireEvent.click(await screen.findByText('AiExperience.submissionAIEntry.draftFeedback'))
    expect(onDraftFeedback).not.toHaveBeenCalled()
    fireEvent.click(await screen.findByRole('button', { name: 'AiExperience.submissionAIEntry.replaceFeedbackConfirm' }))
    expect(onDraftFeedback).toHaveBeenCalledTimes(1)
    // BUG-172: confirming closes the dialog.
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
  })

  it.each([
    ['null body', () => null],
    [
      '404 not-found',
      () => {
        throw new APIError({ code: 'not-found', message: 'submission not found', status: 404 })
      },
    ],
  ])('renders the localized empty state on a %s', async (_label, answer) => {
    answerLatest(answer)

    render(<SubmissionAIEntry submissionUuid={SUBMISSION_ID} />, { wrapper })

    expect(await screen.findByText('AiExperience.submissionAIEntry.emptyTitle')).toBeInTheDocument()
    expect(screen.getByText('AiExperience.submissionAIEntry.emptyDescription')).toBeInTheDocument()
    expect(screen.queryByText(/not found/u)).not.toBeInTheDocument()
    expect(screen.queryByText('AiExperience.errorRecovery.title')).not.toBeInTheDocument()
  })

  it('renders a 503 ai-disabled as the localized unavailable state', async () => {
    answerLatest(() => {
      throw new APIError({ code: 'ai-disabled', message: 'AI features are disabled', status: 503 })
    })

    render(<SubmissionAIEntry submissionUuid={SUBMISSION_ID} />, { wrapper })

    expect(await screen.findByText('AiExperience.errorRecovery.unavailableTitle')).toBeInTheDocument()
    expect(screen.queryByText('AI features are disabled')).not.toBeInTheDocument()
    expect(screen.queryByText('AiExperience.errorRecovery.retry')).not.toBeInTheDocument()
    expect(screen.queryByText('AiExperience.submissionAIEntry.emptyTitle')).not.toBeInTheDocument()
  })
})
