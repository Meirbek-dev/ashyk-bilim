import { QueryClientProvider } from '@tanstack/react-query'
import { Suspense } from 'react'
import { afterEach, describe, expect, test, vi } from 'vite-plus/test'
import { userEvent } from 'vite-plus/test/browser'

import { m } from '#/paraglide/messages'
import type { GradeDraftView } from '#/shared/api/gen/types.gen'
import { createQueryClient } from '#/shared/api/query-client'
import { json } from '#/shared/api/testing'
import { ListSkeleton } from '#/shared/components/list-skeleton'
import { renderInRouter } from '#/shared/components/testing'

import { AiCell } from './ai-cell'
import { AiDraft } from './ai-draft'
import { DraftCard } from './ai-draft-card'
import { confidenceText, draftPoints } from './ai-labels'
import { scoreText } from './labels'

const draft: GradeDraftView = {
  activity_id: '0190a5d2-0000-7000-8000-000000000001',
  agreement: null,
  ai_score: 86,
  calibrated_score: 82.5,
  confidence: 0.8,
  created_at: 10,
  decided_at: null,
  error_code: null,
  final_score: null,
  flags: ['unsupported', 'new_flag'],
  id: '0190a5d2-0000-7000-8000-000000000002',
  is_file: false,
  learner_id: '0190a5d2-0000-7000-8000-000000000003',
  max_score: 100,
  model_name: 'claude',
  proposal: {
    auto_max: 0,
    auto_points: 0,
    calibration_corrections: 3,
    confidence: 0.8,
    flags: [],
    overall_feedback: 'Хорошо, но без примера.',
    parts: [
      {
        ai_score: 3,
        calibrated_score: 2.5,
        excerpt: '',
        feedback: '',
        max_score: 4,
        part_id: 'q1',
        title: 'Опишите цикл',
        criteria: [
          {
            ai_score: 3,
            calibrated_score: 2.5,
            criterion_id: 'c1',
            evidence: [
              { quote: 'цикл повторяет тело', verified: true },
              { quote: 'выдуманная цитата', verified: false },
            ],
            label: 'Понимание',
            max_score: 4,
            rationale: 'Описан повтор, нет выхода.',
            unsupported: true,
          },
        ],
      },
    ],
  },
  run_id: null,
  status: 'ready',
  subject_id: '0190a5d2-0000-7000-8000-000000000004',
  subject_version: 3,
}

const card = (props: { onTransfer?: () => void; onDiscard?: () => void } = {}) =>
  renderInRouter(
    <DraftCard
      draft={draft}
      onTransfer={props.onTransfer ?? (() => undefined)}
      onDiscard={props.onDiscard ?? (() => undefined)}
      discarding={false}
      discardError={null}
    />,
  )

afterEach(() => vi.unstubAllGlobals())

describe('the queue «ИИ» cell', () => {
  test('B-GRD-40 a ready draft shows the proposed score, the confidence and the flags in words (unknown as sent)', async () => {
    const screen = await renderInRouter(<AiCell draft={draft} />)
    await expect.element(screen.getByText(m.grading_ai_proposed({ score: scoreText(82.5) }))).toBeVisible()
    await expect.element(screen.getByText(confidenceText(0.8))).toBeVisible()
    await expect.element(screen.getByText(m.grading_ai_flag_unsupported())).toBeVisible()
    await expect.element(screen.getByText('new_flag')).toBeVisible()
  })

  test('B-GRD-40 a draft being written shows its state; a work without one says so', async () => {
    const queued = await renderInRouter(<AiCell draft={{ ...draft, status: 'queued' }} />)
    await expect.element(queued.getByText(m.grading_ai_status_queued())).toBeVisible()
    const none = await renderInRouter(<AiCell draft={undefined} />)
    await expect.element(none.getByText(m.grading_ai_none())).toBeVisible()
  })
})

describe('the review «Черновик ИИ» card', () => {
  test('B-GRD-43 the draft shows calibrated and raw scores, the calibration, criteria with quotes, marks and feedback', async () => {
    const screen = await card()
    await expect.element(screen.getByRole('heading', { name: m.grading_ai_draft_title() })).toBeVisible()
    await expect.element(screen.getByText(m.grading_ai_raw({ score: scoreText(86) }), { exact: false })).toBeVisible()
    await expect.element(screen.getByText(m.grading_ai_calibrated_by({ count: '3' }))).toBeVisible()
    await expect.element(screen.getByRole('heading', { name: 'Опишите цикл' })).toBeVisible()
    await expect.element(screen.getByText(draftPoints(2.5, 4)).first()).toBeVisible()
    await expect.element(screen.getByText('цикл повторяет тело')).toBeVisible()
    await expect.element(screen.getByText(m.grading_ai_quote_unverified())).toBeVisible()
    await expect.element(screen.getByText(m.grading_ai_unsupported())).toBeVisible()
    await expect.element(screen.getByText('Описан повтор, нет выхода.')).toBeVisible()
    await expect.element(screen.getByText('Хорошо, но без примера.')).toBeVisible()
  })

  test('B-GRD-44 «Перенести в форму» hands the draft over and says the form is filled, not saved', async () => {
    const onTransfer = vi.fn<() => void>()
    const screen = await card({ onTransfer })
    await userEvent.click(screen.getByRole('button', { name: m.grading_ai_transfer() }))
    expect(onTransfer).toHaveBeenCalledOnce()
    await expect.element(screen.getByText(m.grading_ai_transferred())).toBeVisible()
  })

  test('B-GRD-45 «Отклонить» asks first, then discards', async () => {
    const onDiscard = vi.fn<() => void>()
    const screen = await card({ onDiscard })
    await userEvent.click(screen.getByRole('button', { name: m.grading_ai_discard() }))
    expect(onDiscard).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('alertdialog').getByRole('button', { name: m.grading_ai_discard() }))
    expect(onDiscard).toHaveBeenCalledOnce()
  })

  test('B-GRD-45 with AI switched off (ai-disabled) the review shows no card and no error', async () => {
    const problem = { type: 'about:blank', title: 'AI disabled', status: 503, code: 'ai-disabled' }
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify(problem), {
            status: 503,
            headers: { 'content-type': 'application/problem+json' },
          }),
      ),
    )
    const screen = await renderInRouter(
      <QueryClientProvider client={createQueryClient(async () => undefined)}>
        <Suspense fallback={<ListSkeleton />}>
          <AiDraft
            ids={{ activityId: draft.activity_id, submissionId: draft.subject_id }}
            onTransfer={() => undefined}
          />
          <hr data-testid="after" />
        </Suspense>
      </QueryClientProvider>,
    )
    await expect.element(screen.getByTestId('after')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: m.grading_ai_draft_title() }).elements()).toHaveLength(0)
  })

  test('B-GRD-45 a draft that is not ready (applied) shows no card', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json({ ...draft, status: 'applied' })),
    )
    const screen = await renderInRouter(
      <QueryClientProvider client={createQueryClient(async () => undefined)}>
        <Suspense fallback={<ListSkeleton />}>
          <AiDraft
            ids={{ activityId: draft.activity_id, submissionId: draft.subject_id }}
            onTransfer={() => undefined}
          />
          <hr data-testid="after" />
        </Suspense>
      </QueryClientProvider>,
    )
    await expect.element(screen.getByTestId('after')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: m.grading_ai_draft_title() }).elements()).toHaveLength(0)
  })
})
