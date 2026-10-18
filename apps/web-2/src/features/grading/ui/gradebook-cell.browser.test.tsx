import { describe, expect, test } from 'vite-plus/test'

import { m } from '#/paraglide/messages'
import type { GradebookCell as Cell } from '#/shared/api/gen/types.gen'
import { renderInRouter } from '#/shared/components/testing'

import { GradebookCell } from './gradebook-cell'

const cell: Cell = {
  activity_id: '0190a5d2-0000-7000-8000-000000000041',
  assessment_id: '0190a5d2-0000-7000-8000-000000000042',
  attempt_id: null,
  attempt_number: 3,
  attempts: 3,
  due_at_override_unix: null,
  file_submission_id: null,
  final_score: 80,
  graded_at_unix: 1_760_000_000,
  is_late: true,
  pending_attempt: null,
  pending_attempt_id: null,
  pending_attempt_status: null,
  status: 'published',
  submission_id: '0190a5d2-0000-7000-8000-000000000043',
  submitted_at_unix: 1_760_000_000,
  user_id: '0190a5d2-0000-7000-8000-000000000044',
}

describe('GradebookCell', () => {
  test('B-GRD-33 a cell marks a late work and how many attempts it took', async () => {
    const screen = await renderInRouter(<GradebookCell courseId="c" cell={cell} learner="A" activity="Тест" />)
    await expect.element(screen.getByText(m.grading_late())).toBeVisible()
    await expect.element(screen.getByText(m.grading_cell_attempts({ count: '3' }))).toBeVisible()
  })

  test('B-GRD-19 a published grade shows without a badge; a grade not yet released keeps its badge', async () => {
    const published = await renderInRouter(<GradebookCell courseId="c" cell={cell} learner="A" activity="Тест" />)
    await expect.element(published.getByText(m.grading_status_published())).toHaveClass('sr-only')
    const held = await renderInRouter(
      <GradebookCell courseId="c" cell={{ ...cell, status: 'graded' }} learner="A" activity="Тест" />,
    )
    await expect.element(held.getByText(m.grading_status_graded())).toHaveAttribute('data-slot', 'badge')
  })
})
