import { describe, expect, test, vi } from 'vite-plus/test'

import { m } from '#/paraglide/messages'
import type { ActivityState } from '#/shared/api/gen/types.gen'
import { renderInRouter } from '#/shared/components/testing'

import { ContentsRow } from './contents-row'

const quiz = (patch: Partial<ActivityState>): ActivityState => ({
  id: 'a',
  title: 'Тест 1',
  activity_type: 'quiz',
  allowed_actions: ['start'],
  available: true,
  blocked_reason: null,
  opens_at_unix: null,
  complete: false,
  due_at_unix: null,
  is_late: false,
  passed: null,
  required: true,
  score: null,
  state: 'not_started',
  ...patch,
})

describe('ContentsRow', () => {
  test('B-PLY-20 a failed test and work waiting for a grade are named in the contents; untouched work is not', async () => {
    const pick = vi.fn<() => void>()
    const failed = await renderInRouter(<ContentsRow courseId="c" activity={quiz({ state: 'failed' })} onPick={pick} />)
    await expect
      .element(failed.getByRole('link', { name: `Тест 1 ${m.player_state_failed()}`, exact: false }))
      .toBeVisible()
  })

  test('B-PLY-20 work started and not handed in is named in the contents', async () => {
    const row = <ContentsRow courseId="c" activity={quiz({ state: 'in_progress' })} onPick={vi.fn<() => void>()} />
    const screen = await renderInRouter(row)
    await expect
      .element(screen.getByRole('link', { name: `Тест 1 ${m.player_state_in_progress()}`, exact: false }))
      .toBeVisible()
  })

  test('B-PLY-20 untouched work carries no state mark', async () => {
    const screen = await renderInRouter(<ContentsRow courseId="c" activity={quiz({})} onPick={vi.fn<() => void>()} />)
    await expect.element(screen.getByRole('link')).toBeVisible()
    expect(screen.getByText(m.player_state_failed()).query()).toBeNull()
  })
})
