import { describe, expect, test } from 'vite-plus/test'

import { m } from '#/paraglide/messages'
import type { ActivityState } from '#/shared/api/gen/types.gen'
import { renderInRouter } from '#/shared/components/testing'

import { EntryCard } from './entry-card'

const exam = (patch: Partial<ActivityState>): ActivityState => ({
  id: 'a',
  title: 'Экзамен',
  activity_type: 'exam',
  allowed_actions: ['view_feedback'],
  available: true,
  blocked_reason: null,
  opens_at_unix: null,
  complete: false,
  due_at_unix: null,
  is_late: false,
  passed: false,
  required: true,
  score: 40,
  state: 'failed',
  ...patch,
})

describe('EntryCard', () => {
  test('B-PLY-21 work due within 48 h and not handed in says the hours left', async () => {
    const entry = exam({ state: 'not_started', score: null, allowed_actions: ['start'], due_at_unix: 5 * 3600 - 60 })
    const screen = await renderInRouter(<EntryCard courseId="c" entry={entry} action={null} nowUnix={0} />)
    await expect.element(screen.getByText(m.player_hours_left({ hours: 5 }))).toBeVisible()
  })

  test('B-PLY-19 failed with no attempt left says so and leads to the teacher', async () => {
    const screen = await renderInRouter(<EntryCard courseId="c" entry={exam({})} action={null} nowUnix={0} />)
    await expect.element(screen.getByText(m.player_out_of_attempts(), { exact: false })).toBeVisible()
    await expect
      .element(screen.getByRole('link', { name: m.player_ask_teacher() }))
      .toHaveAttribute('href', '/courses/c/discussions')
  })

  test('B-PLY-19 failed with an attempt left offers it and says nothing of the teacher', async () => {
    const screen = await renderInRouter(
      <EntryCard courseId="c" entry={exam({ allowed_actions: ['start'] })} action={null} nowUnix={0} />,
    )
    await expect.element(screen.getByText(m.player_state_failed())).toBeVisible()
    expect(screen.getByText(m.player_out_of_attempts(), { exact: false }).query()).toBeNull()
  })

  test('B-PLY-19 failed behind the teacher’s remediation says so instead of «no attempts left»', async () => {
    const screen = await renderInRouter(
      <EntryCard
        courseId="c"
        entry={exam({ allowed_actions: ['remediate', 'view_feedback'] })}
        action={null}
        nowUnix={0}
      />,
    )
    await expect.element(screen.getByText(m.player_remediation_hint())).toBeVisible()
    expect(screen.getByText(m.player_out_of_attempts(), { exact: false }).query()).toBeNull()
  })

  test('B-PLY-19 failed past the due date names the due date, not «no attempts left»', async () => {
    const screen = await renderInRouter(
      <EntryCard courseId="c" entry={exam({ due_at_unix: 100 })} action={null} nowUnix={200} />,
    )
    await expect.element(screen.getByText(m.player_past_due_retake(), { exact: false })).toBeVisible()
    expect(screen.getByText(m.player_out_of_attempts(), { exact: false }).query()).toBeNull()
  })
})
