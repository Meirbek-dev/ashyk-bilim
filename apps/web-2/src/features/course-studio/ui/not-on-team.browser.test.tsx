import { describe, expect, test } from 'vite-plus/test'

import { m } from '#/paraglide/messages'
import { renderInRouter } from '#/shared/components/testing'

import { NotOnTeam } from './not-on-team'

describe('NotOnTeam', () => {
  test('B-CST-12 a workspace the caller is not on the team of offers the course page and their own courses', async () => {
    const screen = await renderInRouter(<NotOnTeam courseId="0190a5d2-0000-7000-8000-000000000061" />)
    await expect.element(screen.getByRole('heading', { name: m.studio_not_on_team_title() })).toBeVisible()
    await expect
      .element(screen.getByRole('link', { name: m.studio_not_on_team_page() }))
      .toHaveAttribute('href', '/courses/0190a5d2-0000-7000-8000-000000000061')
    await expect
      .element(screen.getByRole('link', { name: m.studio_not_on_team_mine() }))
      .toHaveAttribute('href', '/teach/courses')
  })
})
