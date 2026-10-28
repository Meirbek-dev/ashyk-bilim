import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, test } from 'vite-plus/test'

import { m } from '#/paraglide/messages'
import { renderInRouter } from '#/shared/components/testing'

import { RunnerAlerts } from './runner-alerts'

const guard = {
  active: false,
  count: 0,
  threshold: 3,
  exceeded: false,
  needsFullscreen: false,
  enterFullscreen: () => undefined,
}

const alerts = (patch: { runningOut: boolean; expired?: 'time' | null }) =>
  renderInRouter(
    <QueryClientProvider client={new QueryClient()}>
      <RunnerAlerts
        guard={guard}
        closed={null}
        expired={patch.expired ?? null}
        runningOut={patch.runningOut}
        changed={false}
        attemptId="s"
      />
    </QueryClientProvider>,
  )

describe('RunnerAlerts', () => {
  test('B-ATT-14 the last five minutes are said in words, announced once', async () => {
    const screen = await alerts({ runningOut: true })
    await expect.element(screen.getByRole('alert')).toHaveTextContent(m.attempt_time_running_out())
  })

  test('B-ATT-14 no running-out note before the last minutes', async () => {
    const screen = await alerts({ runningOut: false })
    await expect.element(screen.getByRole('alert')).not.toBeInTheDocument()
  })

  test('B-ATT-14 once the time is up only that is said', async () => {
    const screen = await alerts({ runningOut: true, expired: 'time' })
    await expect.element(screen.getByRole('alert')).toHaveTextContent(m.attempt_time_up())
  })
})
