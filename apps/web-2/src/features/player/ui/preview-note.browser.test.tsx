import { describe, expect, test } from 'vite-plus/test'

import { m } from '#/paraglide/messages'
import { renderInRouter } from '#/shared/components/testing'

import { PreviewNote } from './preview-note'

describe('PreviewNote', () => {
  test('B-PLY-01 a lesson preview speaks of the learners’ mark, not of trial attempts', async () => {
    const lesson = await renderInRouter(<PreviewNote lesson />)
    await expect.element(lesson.getByText(m.player_preview_lesson())).toBeVisible()
    await expect.element(lesson.getByText(m.player_preview_text())).not.toBeInTheDocument()
  })
})
