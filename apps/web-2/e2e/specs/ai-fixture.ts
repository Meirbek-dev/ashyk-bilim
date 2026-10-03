import type { Page, Route } from '@playwright/test'

import type { AiRunKind, CourseAnalysis, RunArtifact, RunStatus, ScopeCapabilities } from '#/shared/api/gen/types.gen'

// AI responses for the ai*.spec.ts files: the live provider is not on the stand (spec 9), so every model answer is
// a `page.route` fixture that writes AG-UI events the way the server does (`ai.rs`, `ai_agents.rs`). Only requests
// the browser makes can be replaced: a test reaches a page whose loader prefetches AI data by a client navigation.

export const ru = { locale: 'ru' } as const
export const RUN = '0190a5d2-0000-7000-8000-00000000a001'
export const THREAD = '0190a5d2-0000-7000-8000-00000000a002'
const API = '**/api/v2/ai'

export const caps = (patch: Partial<ScopeCapabilities> = {}): ScopeCapabilities => ({
  available: true,
  context: { activity_id: null, activity_label: null, course_label: 'E2E', source_count: 3 },
  context_visibility: 'student',
  features: [],
  modes: ['ask', 'explain', 'practice'],
  reason: null,
  restricted: false,
  role: 'student',
  surface: 'student-activity',
  ...patch,
})

export const runStatus = (kind: AiRunKind): RunStatus => ({
  completed_at_unix: null,
  duration_ms: null,
  error_code: null,
  id: RUN,
  input_tokens: null,
  kind,
  metadata: {},
  model_name: null,
  output_tokens: null,
  started_at_unix: 1_760_000_000,
  status: 'queued',
  thread_id: THREAD,
})

type SseEvent = { id?: string; data: Record<string, unknown> }
/** An SSE body: `id:` (the resume point), `event: run`, `data:` one AG-UI event. */
const sse = (events: SseEvent[]) =>
  events.map(({ id, data }) => `${id ? `id: ${id}\n` : ''}event: run\ndata: ${JSON.stringify(data)}\n\n`).join('')

export const fulfillSse = (route: Route, events: SseEvent[]) =>
  route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream' }, body: sse(events) })

export const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({
    status,
    headers: { 'content-type': status >= 400 ? 'application/problem+json' : 'application/json' },
    body: JSON.stringify(body),
  })

export const problem = (status: number, code: string) => ({ type: 'about:blank', title: code, status, code })

/** A finished run's stream: started, two server steps (one resumable id), finished. */
const finishedRun = [
  { id: 'run-started', data: { type: 'RUN_STARTED', threadId: THREAD, runId: RUN } },
  { id: '1760000000000-0', data: { type: 'CUSTOM', name: 'collecting', value: { state: 'collecting_context' } } },
  { id: 'run-end', data: { type: 'RUN_FINISHED', threadId: THREAD, runId: RUN } },
]

/** The scope capabilities every panel reads. */
export const mockCapabilities = (page: Page, value: ScopeCapabilities) =>
  page.route(`${API}/capabilities/scope/**`, route => json(route, value))

/**
 * A run: `queue` answers the RunStatus, the stream waits for `release` (a test marks a navigation first, so the
 * refresh of `latest` after the run is not a repeated GET of the same navigation), artifacts answer `artifacts`.
 */
export async function mockRun(page: Page, queue: string, kind: AiRunKind, artifacts: RunArtifact[] = []) {
  const released = Promise.withResolvers<null>()
  const queued = Promise.withResolvers<unknown>()
  await page.route(`${API}/${queue}`, route => {
    queued.resolve(route.request().postDataJSON())
    return json(route, runStatus(kind), 202)
  })
  await page.route(`${API}/runs/${RUN}/stream`, async route => {
    await released.promise
    return fulfillSse(route, finishedRun)
  })
  await page.route(`${API}/runs/${RUN}/artifacts`, route => json(route, artifacts))
  return { queued: queued.promise, release: () => released.resolve(null) }
}

/**
 * A same-document navigation before a run ends: the run's refresh of a `latest` read is a new read, while the shared
 * fixture counts repeated GETs per navigation (e2e/fixtures/test.ts). A string, evaluated in the page.
 */
export const markNavigation = (page: Page) => page.evaluate('history.replaceState(history.state, "", location.href)')

export const analysis = (patch: Partial<CourseAnalysis> = {}): CourseAnalysis => ({
  content_hash: null,
  course_id: '0190a5d2-0000-7000-8000-00000000a003',
  created_at_unix: 1_760_000_000,
  evidence: {},
  id: '0190a5d2-0000-7000-8000-00000000a004',
  language: 'ru',
  model_name: null,
  previous_public_score: 61,
  public_score: 74,
  published_at_unix: null,
  report: {
    public_score: 74,
    summary: 'Курс понятный, но в нём мало практики.',
    strengths: ['Короткие уроки'],
    risks: ['Нет проверочных заданий'],
    recommendations: [{ title: 'Добавить упражнения', priority: 'high', rationale: 'Закрепить материал' }],
  },
  run_id: RUN,
  stale: true,
  status: 'needs_human_review',
  triggered_by: null,
  ...patch,
})
