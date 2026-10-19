import { describe, expect, test } from 'vite-plus/test'

import { m } from '#/paraglide/messages'
import { renderInRouter } from '#/shared/components/testing'

import { GradeActions } from './grade-actions'

const render = (published: boolean) =>
  renderInRouter(
    <GradeActions
      allowed={['save', 'return', 'publish']}
      pending={null}
      onAction={() => {}}
      error={null}
      published={published}
    />,
  )

describe('GradeActions', () => {
  test('B-GRD-36 a grade not out yet is published with «Опубликовать»', async () => {
    const screen = await render(false)
    await expect.element(screen.getByRole('button', { name: m.grading_publish(), exact: true })).toBeVisible()
  })

  test('B-GRD-36 on a published grade the primary action updates it instead of offering to publish again', async () => {
    const screen = await render(true)
    await expect.element(screen.getByRole('button', { name: m.grading_republish() })).toBeVisible()
    expect(screen.getByRole('button', { name: m.grading_publish(), exact: true }).elements()).toHaveLength(0)
  })
})
