import { QueryClientProvider } from '@tanstack/react-query'
import { Suspense, type ReactNode } from 'react'
import { afterEach, describe, expect, test, vi } from 'vite-plus/test'
import { userEvent } from 'vite-plus/test/browser'

import { m } from '#/paraglide/messages'
import type { ActivityDraftStats, GradingMetrics, IndexStatus } from '#/shared/api/gen/types.gen'
import { createQueryClient } from '#/shared/api/query-client'
import { json } from '#/shared/api/testing'
import { DataTable } from '#/shared/components/data-table'
import { ListSkeleton } from '#/shared/components/list-skeleton'
import { renderInRouter } from '#/shared/components/testing'
import { formatNumber } from '#/shared/i18n/format'

import { labelsFromDrafts } from '../model/consistency'
import { ActivitiesSection } from './activities-section'
import { AutoDrafts } from './auto-drafts'
import { disagreementColumns, driftColumns, pairColumns } from './consistency-columns'
import { IndexCard } from './index-card'
import { MetricsSection } from './metrics-section'

const COURSE = '0190a5d2-0000-7000-8000-000000000001'
const ACTIVITY = '0190a5d2-0000-7000-8000-000000000002'
const ids = { courseId: COURSE, activityId: ACTIVITY }

const metrics: GradingMetrics = {
  activities: [],
  applied_adjusted: 3,
  applied_exact: 6,
  days: 30,
  discarded: 1,
  drafts: 14,
  failed: 0,
  mean_abs_delta: 4.2,
  median_feedback_hours: 20,
  previous_median_feedback_hours: 50,
  ready: 4,
  saved_hours: 0.6,
}

const index: IndexStatus = {
  chunks: 40,
  embedded_chunks: 38,
  failed_sources: 1,
  last_indexed_at: null,
  model: 'hash-ngram-v1',
  sources: 7,
}

const withClient = (ui: ReactNode) =>
  renderInRouter(
    <QueryClientProvider client={createQueryClient(async () => undefined)}>
      <Suspense fallback={<ListSkeleton />}>{ui}</Suspense>
    </QueryClientProvider>,
  )

afterEach(() => vi.unstubAllGlobals())

describe('the «ИИ-проверка» tab', () => {
  test('B-AIG-01 the switch sends the course setting; a refusal stays under it', async () => {
    const api = vi.fn<(request: Request) => Promise<Response>>(async () =>
      Response.json(
        { type: 'about:blank', title: 'AI disabled', status: 503, code: 'ai-disabled' },
        { status: 503, headers: { 'content-type': 'application/problem+json' } },
      ),
    )
    vi.stubGlobal('fetch', api)
    const screen = await withClient(
      <AutoDrafts courseId={COURSE} settings={{ auto_grade_drafts: false, enabled_by: null }} />,
    )
    await userEvent.click(screen.getByRole('switch', { name: m.ai_grading_auto_title() }))
    const request = api.mock.calls[0]?.[0]
    expect(request?.method).toBe('PUT')
    expect(await request?.json()).toEqual({ auto_grade_drafts: true })
    await expect.element(screen.getByRole('alert')).toHaveTextContent(m.errors_ai_disabled())
  })

  test('B-AIG-02 the period is a link per choice; 30 days is the default without ?days=', async () => {
    const screen = await renderInRouter(<MetricsSection courseId={COURSE} search={{ days: 7 }} metrics={metrics} />)
    const nav = screen.getByRole('navigation', { name: m.ai_grading_period() })
    await expect
      .element(nav.getByRole('link', { name: m.ai_grading_days({ count: '7' }) }))
      .toHaveAttribute('href', expect.stringContaining('days=7'))
    await expect
      .element(nav.getByRole('link', { name: m.ai_grading_days({ count: '30' }) }))
      .not.toHaveAttribute('href', expect.stringContaining('days='))
  })

  test('B-AIG-03 time to feedback against the period before, acceptance, gap, saved hours', async () => {
    const screen = await renderInRouter(<MetricsSection courseId={COURSE} search={{}} metrics={metrics} />)
    await expect.element(screen.getByText(m.ai_grading_hours({ value: '20' }))).toBeVisible()
    await expect
      .element(
        screen.getByText(
          m.ai_grading_feedback_before({ hours: m.ai_grading_hours({ value: '50' }), trend: m.ai_grading_faster() }),
        ),
      )
      .toBeVisible()
    await expect.element(screen.getByText(m.ai_grading_points({ value: formatNumber(4.2) }))).toBeVisible()
    await expect.element(screen.getByText(m.ai_grading_hours({ value: formatNumber(0.6) }))).toBeVisible()
  })

  test('B-AIG-04 each activity with drafts leads to its submissions queue; none is one sentence', async () => {
    const row: ActivityDraftStats = { activity_id: ACTIVITY, activity_name: 'Эссе', applied: 2, drafts: 5, ready: 3 }
    const screen = await renderInRouter(<ActivitiesSection courseId={COURSE} rows={[row]} />)
    await expect
      .element(screen.getByRole('link', { name: m.ai_grading_open_queue() }).first())
      .toHaveAttribute('href', `/teach/courses/${COURSE}/activities/${ACTIVITY}/submissions`)
    const empty = await renderInRouter(<ActivitiesSection courseId={COURSE} rows={[]} />)
    await expect.element(empty.getByText(m.ai_grading_activities_empty())).toBeVisible()
  })

  test('B-AIG-05 the index card shows the index and «Переиндексировать» shows the server answer', async () => {
    const api = vi.fn<(request: Request) => Promise<Response>>(async request =>
      request.method === 'POST'
        ? Response.json({ ...index, chunks: 0, embedded_chunks: 0 }, { status: 202 })
        : json(index),
    )
    vi.stubGlobal('fetch', api)
    const screen = await withClient(<IndexCard courseId={COURSE} />)
    await expect.element(screen.getByText(m.ai_grading_index_embedded({ embedded: '38', total: '40' }))).toBeVisible()
    await expect.element(screen.getByText(m.ai_grading_index_never())).toBeVisible()
    await expect.element(screen.getByText('hash-ngram-v1')).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: m.ai_grading_reindex() }))
    await expect.element(screen.getByText(m.ai_grading_index_embedded({ embedded: '0', total: '0' }))).toBeVisible()
    expect(api.mock.calls.some(([request]) => request.url.endsWith(`/ai/retrieval/${COURSE}/reindex`))).toBe(true)
  })
})

describe('an activity’s grading consistency', () => {
  const labels = labelsFromDrafts([])

  test('B-AIG-06 a pair names both learners (linked to their reviews), the similarity and the gap', async () => {
    const pair = {
      a: { learner_id: 'u1', learner_name: 'Айгерим', score_pct: 90, subject_id: 's1' },
      b: { learner_id: 'u2', learner_name: 'Ерлан', score_pct: 60, subject_id: 's2' },
      gap: 30,
      part_key: 'file',
      similarity: 0.93,
    }
    const screen = await renderInRouter(
      <DataTable
        label={m.ai_grading_pairs_title()}
        rows={[pair]}
        columns={pairColumns(ids, labels)}
        getKey={() => 'p'}
      />,
    )
    await expect
      .element(screen.getByRole('link', { name: 'Ерлан' }).first())
      .toHaveAttribute('href', `/teach/courses/${COURSE}/activities/${ACTIVITY}/submissions/s2`)
    await expect.element(screen.getByText(m.ai_grading_part_whole()).first()).toBeInTheDocument()
    await expect.element(screen.getByText(m.ai_grading_points({ value: '30' })).first()).toBeInTheDocument()
  })

  test('B-AIG-07 a disagreement names the learner (linked to the work) with the AI and the teacher grade', async () => {
    const row = {
      ai_score: 40,
      final_score: 75,
      draft_id: 'd',
      learner_id: 'u',
      learner_name: 'Дана',
      subject_id: 's9',
    }
    const screen = await renderInRouter(
      <DataTable
        label={m.ai_grading_disagreements_title()}
        rows={[row]}
        columns={disagreementColumns(ids)}
        getKey={() => 'd'}
      />,
    )
    await expect.element(screen.getByText(m.ai_grading_points({ value: '+35' })).first()).toBeInTheDocument()
    await expect
      .element(screen.getByRole('link', { name: 'Дана' }).first())
      .toHaveAttribute('href', `/teach/courses/${COURSE}/activities/${ACTIVITY}/submissions/s9`)
  })

  test('B-AIG-08 drift reads as «ИИ выше на N п. п.» when the AI grades higher', async () => {
    const row = { corrections: 6, criterion_key: 'c1', offset: -0.12, part_key: 'q1' }
    const screen = await renderInRouter(
      <DataTable label={m.ai_grading_drift_title()} rows={[row]} columns={driftColumns(labels)} getKey={() => 'r'} />,
    )
    await expect
      .element(screen.getByText(m.ai_grading_drift_higher({ amount: m.ai_grading_points({ value: '12' }) })).first())
      .toBeInTheDocument()
    await expect.element(screen.getByText('c1').first()).toBeInTheDocument()
  })
})
