import { describe, expect, test } from 'vite-plus/test'

import { renderInRouter } from '#/shared/components/testing'

import { SignalList } from './signal-list'

const linked = {
  id: 's1',
  code: 'risk_spike' as const,
  params: { count: 3 },
  severity: 'warning' as const,
  href: '/teach/analytics/learners',
}
const title = 'Signals'
const plain = { id: 's2', code: 'stale_rollup' as const, params: {}, severity: 'warning' as const }

describe('SignalList', () => {
  test('B-ANL-40 a signal with a target is a quiet link with a chevron; one without stays plain text', async () => {
    const screen = await renderInRouter(<SignalList title={title} items={[linked, plain]} />)
    const link = screen.getByRole('link')
    await expect.element(link).toHaveAttribute('href', '/teach/analytics/learners')
    // Not underlined until hovered: a column of underlined sentences reads as one block of link text.
    expect(getComputedStyle(link.element()).textDecorationLine).toBe('none')
    expect(link.element().querySelector('svg')).not.toBeNull()
    expect(screen.getByRole('listitem').all()).toHaveLength(2)
    expect(screen.getByRole('link').all()).toHaveLength(1)
  })
})
