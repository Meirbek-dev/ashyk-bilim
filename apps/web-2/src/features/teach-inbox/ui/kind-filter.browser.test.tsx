import { describe, expect, test } from 'vite-plus/test'

import { m } from '#/paraglide/messages'
import { renderInRouter } from '#/shared/components/testing'

import { KindFilter } from './kind-filter'

describe('KindFilter', () => {
  test('B-INB-04 each kind tab says how many items it holds, «Все» their sum, an empty kind no number', async () => {
    const screen = await renderInRouter(
      <KindFilter
        search={{}}
        counts={[
          { kind: 'needs_grading', count: 3 },
          { kind: 'sla_breach', count: 1 },
        ]}
      />,
    )
    await expect.element(screen.getByRole('link', { name: `${m.inbox_filter_all()} 4` })).toBeVisible()
    await expect.element(screen.getByRole('link', { name: `${m.inbox_kind_needs_grading()} 3` })).toBeVisible()
    await expect.element(screen.getByRole('link', { name: `${m.inbox_kind_sla_breach()} 1` })).toBeVisible()
    await expect.element(screen.getByRole('link', { name: m.inbox_kind_awaiting_release(), exact: true })).toBeVisible()
  })
})
