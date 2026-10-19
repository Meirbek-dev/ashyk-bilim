import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Suspense } from 'react'
import { expect, test } from 'vite-plus/test'

import { m } from '#/paraglide/messages'
import type { SessionSummary } from '#/shared/api/gen/types.gen'
import { renderInRouter } from '#/shared/components/testing'

import { sessionsOptions } from '../queries'
import { SessionsSection } from './sessions-section'

const session = (n: number): SessionSummary => ({
  handle: `s${n}`,
  current: n === 0,
  created_at_unix: 1_760_000_000,
  last_seen_unix: 1_760_000_000 - n * 60,
  ip: null,
  user_agent: null,
})

test('B-SET-20 dozens of sessions: the latest five, the rest behind «Show more»', async () => {
  const client = new QueryClient()
  client.setQueryData(
    sessionsOptions().queryKey,
    Array.from({ length: 12 }, (_, n) => session(n)),
  )
  const screen = await renderInRouter(
    <QueryClientProvider client={client}>
      <Suspense>
        <SessionsSection />
      </Suspense>
    </QueryClientProvider>,
  )
  const devices = screen.getByRole('heading', { level: 3, name: m.settings_session_unknown_device() })
  await expect.element(devices.first()).toBeInTheDocument()
  expect(devices.elements()).toHaveLength(5)
  await screen.getByRole('button', { name: m.ui_show_more() }).click()
  await expect.poll(() => devices.elements().length).toBe(12)
  await expect.element(screen.getByRole('button', { name: m.ui_show_more() })).not.toBeInTheDocument()
})
