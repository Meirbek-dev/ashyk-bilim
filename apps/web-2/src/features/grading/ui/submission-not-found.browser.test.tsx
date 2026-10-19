import { expect, test } from 'vite-plus/test'

import { m } from '#/paraglide/messages'
import { renderInRouter } from '#/shared/components/testing'

import { SubmissionNotFound } from './submission-not-found'

test('a missing one says why it may be gone, not just its heading', async () => {
  const screen = await renderInRouter(<SubmissionNotFound />)
  await expect.element(screen.getByRole('heading', { level: 1, name: m.grading_not_found() })).toBeVisible()
  await expect.element(screen.getByText(m.ui_not_found_text())).toBeVisible()
})
