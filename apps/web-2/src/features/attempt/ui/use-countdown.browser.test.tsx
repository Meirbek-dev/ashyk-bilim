import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { expect, test, vi } from 'vite-plus/test'

import { useCountdown } from './use-countdown'

function Clock({
  remaining,
  receivedAt,
  revision,
}: {
  remaining: number | null
  receivedAt: number
  revision: number
}) {
  const left = useCountdown(remaining, receivedAt)
  return <output data-revision={revision}>{left}</output>
}

test('B-ATT-14 countdown keeps ticking during frequent answer renders and stops at zero', () => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
  const host = document.createElement('div')
  const root = createRoot(host)
  const receivedAt = Date.now()
  const render = (remaining: number | null, revision = 0) =>
    flushSync(() => root.render(<Clock remaining={remaining} receivedAt={receivedAt} revision={revision} />))
  try {
    render(5)
    expect(host.textContent).toBe('5')
    for (let revision = 1; revision <= 6; revision++) {
      flushSync(() => vi.advanceTimersByTime(200))
      render(5, revision)
    }
    expect(host.textContent).toBe('4')
    for (let second = 0; second < 4; second++) flushSync(() => vi.advanceTimersByTime(1000))
    expect(host.textContent).toBe('0')
    expect(vi.getTimerCount()).toBe(0)
    render(null)
    expect(host.textContent).toBe('')
    expect(vi.getTimerCount()).toBe(0)
    render(10)
    flushSync(() => vi.advanceTimersByTime(1000))
    expect(Number(host.textContent)).toBeLessThan(5)
  } finally {
    flushSync(() => root.unmount())
    vi.useRealTimers()
  }
})
