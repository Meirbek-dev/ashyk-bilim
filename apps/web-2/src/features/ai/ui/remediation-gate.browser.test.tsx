import { QueryClientProvider, useSuspenseQuery } from '@tanstack/react-query'
import { Suspense } from 'react'
import { afterEach, describe, expect, test, vi } from 'vite-plus/test'
import { userEvent } from 'vite-plus/test/browser'

import { m } from '#/paraglide/messages'
import { formatPercent } from '#/shared/i18n/format'
import { createQueryClient } from '#/shared/api/query-client'
import { json } from '#/shared/api/testing'
import type { RemediationSession, SessionInfo } from '#/shared/api/gen/types.gen'
import { sessionOptions } from '#/shared/auth/session'
import { renderInRouter } from '#/shared/components/testing'

import { RemediationGate } from './remediation-gate'

const USER = '0190a5d2-0000-7000-8000-0000000000f1'
const ACTIVITY = '0190a5d2-0000-7000-8000-0000000000f2'
const OTHER = '0190a5d2-0000-7000-8000-0000000000f6'
const HOST_KEY = ['host-attempt-state']

const user: SessionInfo = {
  user_id: USER,
  user: {
    id: USER,
    username: 'learner',
    display_name: 'Learner',
    email: 'learner@e2e.test',
    locale: 'ru-RU',
    language: 'ru',
    email_verified: true,
    avatar_key: null,
    theme: null,
  },
  roles: [],
  permissions: [],
  capabilities: [],
  mfa_enabled: false,
}

const session = (activityId: string, status: RemediationSession['status'] = 'assigned'): RemediationSession => ({
  activity_id: activityId,
  analysis_id: '0190a5d2-0000-7000-8000-0000000000f3',
  created_at_unix: 1_760_000_000,
  file_submission_attempt_id: null,
  gate_mode: true,
  id: `0190a5d2-0000-7000-8000-0000000000${activityId === ACTIVITY ? 'f4' : 'f5'}`,
  language: 'ru',
  lecture: {
    title: `Работа по ${activityId === ACTIVITY ? 'этой' : 'другой'} активности`,
    micro_lecture_markdown: 'Текст',
  },
  passed_at_unix: status === 'passed' ? 1_760_000_100 : null,
  run_id: null,
  score: status === 'passed' ? 100 : null,
  status,
  student_user_id: USER,
  submission_id: null,
  test: { questions: [{ prompt: 'Вопрос', answer: '', explanation: '' }] },
  updated_at_unix: 1_760_000_000,
})

/** The host page's own read (the attempt state): the gate re-reads it once the session is passed. */
function Host({ reads }: { reads: () => number }) {
  useSuspenseQuery({ queryKey: HOST_KEY, queryFn: () => reads() })
  return <RemediationGate activityId={ACTIVITY} invalidates={[HOST_KEY]} />
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('RemediationGate (where the gate blocks the learner)', () => {
  test("B-AI-26 the blocked page shows this activity's session in place; passing it re-reads the host state", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (request: Request) => {
        const path = new URL(request.url).pathname
        if (path.endsWith(`/remediation/student/${USER}`)) return json([session(ACTIVITY), session(OTHER)])
        if (path.endsWith('/complete')) return json(session(ACTIVITY, 'passed'))
        return new Response(null, { status: 404 })
      }),
    )
    const client = createQueryClient(async () => undefined)
    client.setQueryData(sessionOptions().queryKey, user)
    let reads = 0
    const screen = await renderInRouter(
      <QueryClientProvider client={client}>
        <Suspense fallback={null}>
          <Host reads={() => ++reads} />
        </Suspense>
      </QueryClientProvider>,
    )
    await expect.element(screen.getByRole('heading', { name: 'Работа по этой активности' })).toBeVisible()
    await expect.element(screen.getByText('Работа по другой активности')).not.toBeInTheDocument()
    const before = reads
    await userEvent.fill(screen.getByRole('textbox', { name: m.ai_remediation_answer({ number: 1 }) }), 'Ответ')
    await userEvent.click(screen.getByRole('button', { name: m.ai_remediation_complete() }))
    await expect.element(screen.getByText(m.ai_remediation_result_passed({ score: formatPercent(100) }))).toBeVisible()
    await expect.poll(() => reads).toBeGreaterThan(before)
  })

  test('B-AI-26 two generated questions with the same prompt are both asked', async () => {
    const errors = vi.spyOn(console, 'error')
    const twice = session(ACTIVITY)
    twice.test.questions = [0, 1].map(() => ({ prompt: 'Вопрос', answer: '', explanation: '' }))
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json([twice])),
    )
    const client = createQueryClient(async () => undefined)
    client.setQueryData(sessionOptions().queryKey, user)
    const screen = await renderInRouter(
      <QueryClientProvider client={client}>
        <Suspense fallback={null}>
          <RemediationGate activityId={ACTIVITY} invalidates={[]} />
        </Suspense>
      </QueryClientProvider>,
    )
    await expect.element(screen.getByRole('textbox', { name: m.ai_remediation_answer({ number: 2 }) })).toBeVisible()
    await expect.element(screen.getByRole('textbox', { name: m.ai_remediation_answer({ number: 1 }) })).toBeVisible()
    expect(errors.mock.calls.flat().join(' ')).not.toContain('same key')
  })
})
