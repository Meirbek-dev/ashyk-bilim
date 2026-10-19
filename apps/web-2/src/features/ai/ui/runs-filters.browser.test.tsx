import { describe, expect, test } from 'vite-plus/test'

import { m } from '#/paraglide/messages'
import { renderInRouter } from '#/shared/components/testing'

import { RunsFilters } from './runs-filters'

describe('runs filters', () => {
  test('B-AI-21 the unset status and kind each say what they are all of', async () => {
    const screen = await renderInRouter(<RunsFilters search={{ days: 7 }} />)
    await expect.element(screen.getByRole('combobox', { name: m.ai_filter_status() })).toBeVisible()
    const shown = (name: string) => {
      const select = screen.getByRole('combobox', { name }).element()
      return select instanceof HTMLSelectElement ? select.selectedOptions[0]?.text : undefined
    }
    expect(shown(m.ai_filter_status())).toBe(m.ai_all_statuses())
    expect(shown(m.ai_filter_kind())).toBe(m.ai_all_kinds())
  })
})
