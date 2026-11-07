import { expect, test } from 'vite-plus/test'

import { m } from '#/paraglide/messages'
import type { ProgressState } from '#/shared/api/gen/types.gen'
import { renderInRouter } from '#/shared/components/testing'

import { CompletionHeader } from './completion-header'

const progress = (patch: Partial<ProgressState>): ProgressState => ({
  completed_required_count: 3,
  total_required_count: 3,
  missing_required_count: 0,
  needs_grading_count: 0,
  progress_pct: 100,
  grade_average: null,
  completed_at_unix: null,
  ...patch,
})

test('B-PLY-14 a finished course is greeted, an unfinished one is summed up', async () => {
  const done = await renderInRouter(<CompletionHeader progress={progress({})} completed />)
  await expect.element(done.getByRole('heading', { level: 1, name: m.player_congrats() })).toBeVisible()
  await expect.element(done.getByText(m.player_completed())).toBeVisible()

  const halfway = progress({ completed_required_count: 1, missing_required_count: 2, progress_pct: 33 })
  const open = await renderInRouter(<CompletionHeader progress={halfway} completed={false} />)
  await expect.element(open.getByRole('heading', { level: 1, name: m.player_finish() })).toBeVisible()
})

test('a course with nothing to take yet counts nothing: no «0 %, 0 из 0»', async () => {
  const empty = progress({ completed_required_count: 0, total_required_count: 0, progress_pct: 0 })
  const page = await renderInRouter(<CompletionHeader progress={empty} completed={false} />)
  await expect.element(page.getByRole('heading', { level: 1, name: m.player_finish() })).toBeVisible()
  await expect.element(page.getByText(m.player_progress({ done: 0, total: 0 }))).not.toBeInTheDocument()
  await expect.element(page.getByRole('progressbar')).not.toBeInTheDocument()
})
