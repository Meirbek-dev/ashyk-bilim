import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, test, vi } from 'vite-plus/test'

import { m } from '#/paraglide/messages'
import { renderInRouter } from '#/shared/components/testing'

import { LearnerLinks } from './learner-links'

const row = {
  course_id: '0190a5d2-0000-7000-8000-0000000000c1',
  user_id: '0190a5d2-0000-7000-8000-0000000000d1',
  user_display_name: 'Айжан Б',
  user_username: 'aizhan.b',
  user_email: 'aizhan@example.com',
  open_grading_blocks: 2,
}

// `GET /me/conversations/peers/{id}`: the teacher may write to this learner.
const peer = {
  conversation_id: null,
  allowed_actions: ['send'],
  deny_reason: null,
  peer: {
    id: row.user_id,
    username: row.user_username,
    display_name: row.user_display_name,
    avatar_key: null,
    available: true,
  },
}

const render = () => {
  vi.stubGlobal('fetch', () => Promise.resolve(Response.json(peer)))
  return renderInRouter(
    <QueryClientProvider client={new QueryClient()}>
      <LearnerLinks row={row} />
    </QueryClientProvider>,
  )
}

afterEach(() => vi.unstubAllGlobals())

describe('LearnerLinks', () => {
  test('B-ANL-38 B-ANL-29 the panel leads to the course learners found by name and to the works waiting', async () => {
    const screen = await render()
    const learners = screen.getByRole('link', { name: m.analytics_learner_in_course() })
    await expect
      .element(learners)
      .toHaveAttribute('href', expect.stringContaining(`/teach/courses/${row.course_id}/learners?q=`))
    await expect
      .element(screen.getByRole('link', { name: m.analytics_grade_blocks({ count: '2' }) }))
      .toHaveAttribute('href', expect.stringContaining('/teach?course='))
  })

  test('B-ANL-42 «Связаться» has a way: an email to the learner, and the roster found by username', async () => {
    const screen = await render()
    await expect
      .element(screen.getByRole('link', { name: m.analytics_write_email() }))
      .toHaveAttribute('href', 'mailto:aizhan@example.com')
    await expect
      .element(screen.getByRole('link', { name: m.analytics_learner_in_course() }))
      .toHaveAttribute('href', expect.stringContaining('q=aizhan.b'))
  })

  test('a personal message to the learner, about the course, recorded as an intervention (docs/DIALOGS.md 12)', async () => {
    const screen = await render()
    await expect
      .element(screen.getByRole('link', { name: m.conversations_write_learner() }))
      .toHaveAttribute('href', `/conversations/new?to=${row.user_id}&course=${row.course_id}&intervention=true`)
  })
})
