import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Suspense } from 'react'
import { expect, test } from 'vite-plus/test'

import { landingCoursesOptions } from '#/features/catalog'
import { m } from '#/paraglide/messages'
import type { Capability, Enrollment, SessionInfo } from '#/shared/api/gen/types.gen'
import { sessionOptions } from '#/shared/auth/session'
import { renderInRouter } from '#/shared/components/testing'

import { anyEnrollmentOptions } from '../queries'
import { HomeWelcome } from './home-welcome'

const session = (capabilities: Capability[]): SessionInfo => ({
  capabilities,
  mfa_enabled: false,
  permissions: [],
  roles: [],
  user_id: 'u',
  user: {
    id: 'u',
    username: 'u',
    display_name: 'U',
    email: 'u@e.test',
    locale: 'ru-RU',
    language: 'ru',
    email_verified: true,
    avatar_key: null,
    theme: null,
  },
})

const run: Enrollment = {
  course: { id: 'c', name: 'C', archived_at_unix: null, thumbnail_key: null },
  course_id: 'c',
  course_total_steps: 1,
  created_at_unix: 1_760_000_000,
  id: 'r',
  learning_status: 'completed',
  next_activity_id: null,
  progress_pct: 100,
  updated_at_unix: 1_760_000_000,
}

async function show(capabilities: Capability[], runs: number) {
  const client = new QueryClient()
  client.setQueryData(sessionOptions().queryKey, session(capabilities))
  client.setQueryData(landingCoursesOptions().queryKey, { items: [], next_cursor: null })
  client.setQueryData(anyEnrollmentOptions().queryKey, {
    next_cursor: null,
    runs: Array.from({ length: runs }, () => run),
  })
  return renderInRouter(
    <QueryClientProvider client={client}>
      <Suspense>
        <HomeWelcome />
      </Suspense>
    </QueryClientProvider>,
  )
}

const primary = (screen: Awaited<ReturnType<typeof show>>) => screen.getByRole('link').elements()[0]?.textContent

test('B-HOME-12 a teacher with no course to learn is led to teaching first, the catalog beside it', async () => {
  const screen = await show(['teach'], 0)
  await expect.element(screen.getByRole('link', { name: m.home_go_teach() })).toBeInTheDocument()
  expect(primary(screen)).toBe(m.home_go_teach())
})

test('B-HOME-12 a teacher who finished courses keeps the catalog first', async () => {
  const screen = await show(['teach'], 1)
  await expect.element(screen.getByRole('link', { name: m.home_go_teach() })).toBeInTheDocument()
  expect(primary(screen)).toBe(m.home_find_next_course())
})

test('B-HOME-12 a learner sees no way into teaching', async () => {
  const screen = await show([], 0)
  await expect.element(screen.getByRole('link', { name: m.home_find_course() })).toBeInTheDocument()
  await expect.element(screen.getByRole('link', { name: m.home_go_teach() })).not.toBeInTheDocument()
})
