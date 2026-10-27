import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Suspense } from 'react'
import { afterEach, describe, expect, test, vi } from 'vite-plus/test'

import { m } from '#/paraglide/messages'
import type { EvalDashboard } from '#/shared/api/gen/types.gen'
import { renderInRouter } from '#/shared/components/testing'

import { AdminEvals } from './admin-evals'

const noEvals: EvalDashboard = {
  evals: { average_score: null, failed: 0, passed: 0, total: 0 },
  recent_evals: [],
  runs: { aborted: 0, failed: 1, queued: 0, running: 0, succeeded: 18, total: 19 },
}

afterEach(() => vi.unstubAllGlobals())

describe('AdminEvals', () => {
  test('B-AI-23 with no evals yet: run counts under their own label, a line on where evals come from, no zero counters', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(Response.json(noEvals)))
    const screen = await renderInRouter(
      <QueryClientProvider client={new QueryClient()}>
        <Suspense>
          <AdminEvals />
        </Suspense>
      </QueryClientProvider>,
    )
    await expect.element(screen.getByRole('heading', { name: m.ai_evals_runs_label() })).toBeVisible()
    await expect.element(screen.getByText(m.ai_evals_empty())).toBeVisible()
    expect(screen.getByText(m.ai_evals_total({ count: '0' })).query()).toBeNull()
    expect(screen.getByText(m.ai_evals_recent()).query()).toBeNull()
  })
})
