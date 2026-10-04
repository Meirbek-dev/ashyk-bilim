import { QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, test, vi } from 'vite-plus/test'
import { userEvent } from 'vite-plus/test/browser'

import { m } from '#/paraglide/messages'
import { createQueryClient } from '#/shared/api/query-client'
import { json } from '#/shared/api/testing'
import type { RemediationSession, RunStatus, SubmissionAnalysis } from '#/shared/api/gen/types.gen'
import { renderInRouter } from '#/shared/components/testing'

import { SubmissionAiPanel } from './submission-ai-panel'

const SUBMISSION = '0190a5d2-0000-7000-8000-0000000000e1'
const RUN = '0190a5d2-0000-7000-8000-0000000000e2'

const analysis: SubmissionAnalysis = {
  analysis: {
    summary: 'Ошибки в циклах.',
    knowledge_gaps: [{ concept: 'Условие выхода', severity: 'high', evidence: 'Бесконечный цикл в задаче 2' }],
    next_action: 'Повторить тему циклов',
  },
  created_at_unix: 1_760_000_000,
  evidence: {},
  file_submission_attempt_id: null,
  gap_count: 1,
  id: '0190a5d2-0000-7000-8000-0000000000e3',
  language: 'ru',
  model_name: null,
  run_id: null,
  status: 'ready',
  submission_id: SUBMISSION,
  triggered_by: null,
}

const queued: RunStatus = {
  completed_at_unix: null,
  duration_ms: null,
  error_code: null,
  id: RUN,
  input_tokens: null,
  kind: 'remediation',
  metadata: {},
  model_name: null,
  output_tokens: null,
  started_at_unix: 1_760_000_000,
  status: 'queued',
  thread_id: '0190a5d2-0000-7000-8000-0000000000e4',
}

const session: RemediationSession = {
  activity_id: '0190a5d2-0000-7000-8000-0000000000e5',
  analysis_id: analysis.id,
  created_at_unix: 1_760_000_100,
  file_submission_attempt_id: null,
  gate_mode: true,
  id: '0190a5d2-0000-7000-8000-0000000000e6',
  language: 'ru',
  lecture: { title: 'Циклы', micro_lecture_markdown: 'Текст' },
  passed_at_unix: null,
  run_id: RUN,
  score: null,
  status: 'assigned',
  student_user_id: '0190a5d2-0000-7000-8000-0000000000e7',
  submission_id: SUBMISSION,
  test: { questions: [] },
  updated_at_unix: 1_760_000_100,
}

/** An AG-UI run stream as `POST /ai/runs/{id}/stream` writes it (`event: run`, `id:` = Redis stream id). */
const stream = () =>
  new Response(
    [
      { id: 'run-started', data: { type: 'RUN_STARTED', threadId: 't', runId: RUN } },
      { id: '1-0', data: { type: 'CUSTOM', name: 'running', value: { state: 'running', message: null, payload: {} } } },
      { id: 'run-end', data: { type: 'RUN_FINISHED', threadId: 't', runId: RUN } },
    ]
      .map(({ id, data }) => `id: ${id}\nevent: run\ndata: ${JSON.stringify(data)}\n\n`)
      .join(''),
    { headers: { 'content-type': 'text/event-stream' } },
  )

function stubApi(state: { analysis: SubmissionAnalysis | null; gate: RemediationSession | null }) {
  const api = vi.fn<(request: Request) => Promise<Response>>(async request => {
    const path = new URL(request.url).pathname
    if (path.endsWith('/generate/queue')) {
      state.gate = session
      return json(queued)
    }
    if (path.endsWith(`/runs/${RUN}/stream`)) return stream()
    if (path.endsWith(`/submission-analysis/${SUBMISSION}/latest`)) return json(state.analysis)
    if (path.endsWith(`/remediation/${SUBMISSION}/latest`)) return json(state.gate)
    return new Response(null, { status: 404 })
  })
  vi.stubGlobal('fetch', api)
  return api
}

const render = () =>
  renderInRouter(
    <QueryClientProvider client={createQueryClient(async () => undefined)}>
      <SubmissionAiPanel submissionId={SUBMISSION} />
    </QueryClientProvider>,
  )

afterEach(() => vi.unstubAllGlobals())

describe('SubmissionAiPanel (the grader slot of slice 6.1)', () => {
  test('B-AI-16 B-AI-17 without an analysis the gate is off and asks for an analysis first', async () => {
    stubApi({ analysis: null, gate: null })
    const screen = await render()
    await expect.element(screen.getByText(m.ai_submission_empty())).toBeVisible()
    await expect.element(screen.getByText(m.ai_gate_needs_analysis())).toBeVisible()
    await expect.element(screen.getByRole('button', { name: m.ai_gate_assign() })).toBeDisabled()
  })

  test('B-AI-16 B-AI-17 the analysis shows its gaps; the gate asks first, queues with gate_mode, then holds', async () => {
    const api = stubApi({ analysis, gate: null })
    const screen = await render()
    await expect.element(screen.getByText('Условие выхода')).toBeVisible()
    await expect.element(screen.getByText('Повторить тему циклов')).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: m.ai_gate_assign() }))
    await userEvent.click(screen.getByRole('alertdialog').getByRole('button', { name: m.ai_gate_assign() }))
    await expect.element(screen.getByText(m.ai_gate_assigned())).toBeVisible()
    await expect.element(screen.getByRole('button', { name: m.ai_gate_assign() })).toBeDisabled()
    const queue = api.mock.calls.map(([request]) => request).find(request => request.url.endsWith('/generate/queue'))
    expect(await queue?.json()).toMatchObject({ gate_mode: true })
  })
})
