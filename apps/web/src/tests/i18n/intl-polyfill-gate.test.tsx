import { act, render, screen } from '@testing-library/react'
import { Suspense } from 'react'
import { describe, expect, it, vi } from 'vite-plus/test'

// The runtime needs the polyfill until it is loaded, then no more - the real
// `needsKkIntlPolyfill` flips the same way once the formatjs data is in.
const state = vi.hoisted(() => ({ loaded: false, useCalls: 0 }))
vi.mock('@/i18n/intl-polyfill', () => ({
  needsKkIntlPolyfill: (locale: string) => locale.startsWith('kk') && !state.loaded,
  loadKkIntlPolyfill: () =>
    Promise.resolve().then(() => {
      state.loaded = true
    }),
}))
vi.mock('react', async importOriginal => {
  const actual = await importOriginal<typeof import('react')>()
  return {
    ...actual,
    use: (usable: Parameters<typeof actual.use>[0]) => {
      state.useCalls++
      return actual.use(usable)
    },
  }
})

import { IntlPolyfillGate } from '@/components/providers/IntlPolyfillGate'

// React requires a component that suspended on use() to call use() again on
// the render that resumes it («This library called use() to suspend in a
// previous render but did not call use() when it finished») - the gate used to
// re-ask `needsKkIntlPolyfill`, which is false once the polyfill is in.
describe('IntlPolyfillGate', () => {
  it('keeps calling use() on every kk render after the polyfill loaded', async () => {
    const tree = (text: string) => (
      <Suspense fallback={<span>waiting</span>}>
        <IntlPolyfillGate locale="kk-KZ">
          <span>{text}</span>
        </IntlPolyfillGate>
      </Suspense>
    )
    const view = await act(async () => render(tree('ready')))
    expect(await screen.findByText('ready')).toBeInTheDocument()
    expect(state.loaded).toBe(true)

    const before = state.useCalls
    await act(async () => view.rerender(tree('again')))
    expect(screen.getByText('again')).toBeInTheDocument()
    expect(state.useCalls).toBeGreaterThan(before)
  })
})
