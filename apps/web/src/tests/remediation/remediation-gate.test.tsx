/** @vitest-environment jsdom */
// BUG-152: a gate-mode remediation has a learner surface — the result card
// names the reason and opens the session; completing it posts the
// self-reported score and invalidates the attempt state (no reload).

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { NextIntlClientProvider } from 'next-intl'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import AttemptResultCard from '@/features/assessments/shell/AttemptResultCard'
import { DEFAULT_POLICY_VIEW } from '@/features/assessments/domain/policy'
import type { AttemptViewModel } from '@/features/assessments/domain/view-models'
import ruMessages from '@/messages/ru-RU.json'

const mocks = vi.hoisted(() => ({ apiJson: vi.fn(), toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/api-client', () => ({ apiJson: mocks.apiJson }))
vi.mock('sonner', () => ({ toast: mocks.toast }))
vi.mock('@/hooks/useSession', () => ({ useSession: () => ({ user: { id: USER_ID }, can: () => false }) }))
vi.mock('@/hooks/useApiError', () => ({ useApiError: () => ({ toastApiError: vi.fn() }) }))
vi.mock('@/features/content-markdown', () => ({
  MarkdownContent: ({ content }: { content: string }) => <span>{content}</span>,
}))

const USER_ID = '01a0910c-796a-75f5-b21c-93955233d327'
const ACTIVITY_ID = '01a091a1-0461-7a3c-9433-3920a37d67e7'
const SESSION_ID = '01a09221-0965-74e3-b175-041d6f27992e'

const session = {
  id: SESSION_ID,
  submission_id: '01a091c9-0199-7e95-9346-d1ae4fc9823e',
  file_submission_attempt_id: null,
  activity_id: ACTIVITY_ID,
  student_user_id: USER_ID,
  analysis_id: null,
  run_id: null,
  status: 'assigned',
  gate_mode: true,
  language: 'ru',
  lecture: {
    title: 'Черновик восполнения пробелов',
    micro_lecture_markdown: 'Повторите штрафы за опоздание.',
    learning_objectives: [],
    citations: [],
  },
  test: {
    questions: [
      { prompt: 'Как считается штраф?', choices: ['по дням', 'по часам'], answer: 'по дням', explanation: 'ceil' },
      { prompt: 'Максимум дней?', choices: [], answer: '5', explanation: '' },
    ],
  },
  score: null,
  passed_at_unix: null,
  created_at_unix: 1_789_000_000,
  updated_at_unix: 1_789_000_000,
}

const vm = {
  kind: 'TYPE_CUSTOM',
  title: 'Викторина 1',
  activityUuid: ACTIVITY_ID,
  isResultVisible: true,
  isReturnedForRevision: false,
  canStartRevision: false,
  canSubmit: false,
  disabledActionReasons: ['REMEDIATION_REQUIRED'],
  score: { percent: 83.33, source: 'final' },
  startedAt: null,
  policy: DEFAULT_POLICY_VIEW,
  items: [],
  itemScores: {},
  latePenaltyPct: null,
  attemptCapPercent: null,
  autoSubmitReason: null,
  generalFeedback: null,
} as unknown as AttemptViewModel

function renderCard(client: QueryClient) {
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="ru" messages={ruMessages} timeZone="UTC">
        <AttemptResultCard vm={vm} onRetry={() => undefined} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  )
}

describe('RemediationGate on the result card (BUG-152)', () => {
  beforeEach(() => {
    mocks.apiJson.mockReset()
    mocks.toast.success.mockReset()
    mocks.toast.error.mockReset()
  })

  it('names the reason, opens the session and completes it with the self-check score', async () => {
    mocks.apiJson.mockImplementation((path: string, init?: RequestInit, parse?: (v: unknown) => unknown) => {
      if (path === `ai/remediation/student/${USER_ID}`) return Promise.resolve(parse ? parse([session]) : [session])
      if (path === `ai/remediation/sessions/${SESSION_ID}/complete`) {
        const { score } = JSON.parse(String(init?.body)) as { score: number }
        const done = { ...session, score, status: score >= 70 ? 'passed' : 'failed' }
        return Promise.resolve(parse ? parse(done) : done)
      }
      return Promise.reject(new Error(`unexpected ${path}`))
    })
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    renderCard(client)

    // No «Повторить» while gated, the reason instead.
    expect(screen.queryByRole('button', { name: 'Повторить' })).toBeNull()
    expect(screen.getByText('Сначала завершите назначенное исправление.')).toBeInTheDocument()
    fireEvent.click(await screen.findByRole('button', { name: 'Пройти исправление' }))

    expect(screen.getByText('Повторите штрафы за опоздание.')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Показать ответ' })).toHaveLength(2)
    const complete = screen.getByRole('button', { name: 'Завершить исправление' })
    expect(complete).toBeDisabled()
    for (const reveal of screen.getAllByRole('button', { name: 'Показать ответ' })) fireEvent.click(reveal)
    expect(screen.getByText(/по дням/, { selector: 'p' })).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('checkbox')[0]!)
    fireEvent.click(screen.getAllByRole('checkbox')[1]!)
    fireEvent.click(complete)

    await waitFor(() =>
      expect(mocks.apiJson).toHaveBeenCalledWith(
        `ai/remediation/sessions/${SESSION_ID}/complete`,
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ score: 100 }) }),
        expect.any(Function),
      ),
    )
    await waitFor(() => expect(mocks.toast.success).toHaveBeenCalledWith(expect.stringContaining('100%')))
    // The gate lifted server-side: the attempt state is refetched, not reloaded.
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['assessments'] })
  })

  it('shows only the reason when no gate session is found', async () => {
    mocks.apiJson.mockResolvedValue([])
    renderCard(new QueryClient({ defaultOptions: { queries: { retry: false } } }))
    expect(await screen.findByText('Сначала завершите назначенное исправление.')).toBeInTheDocument()
    await waitFor(() => expect(mocks.apiJson).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: 'Пройти исправление' })).toBeNull()
  })
})
