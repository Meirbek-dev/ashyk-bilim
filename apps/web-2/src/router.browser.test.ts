import { afterEach, expect, test, vi } from 'vite-plus/test'

import { getRouter, isWebKit } from './router'

afterEach(() => vi.restoreAllMocks())

const skipped = () => Promise.reject(new DOMException('Transition was skipped', 'InvalidStateError'))

test('a skipped view transition (resize mid-navigation) runs the update and rejects nothing unhandled', async () => {
  const unhandled = vi.fn<(event: PromiseRejectionEvent) => void>()
  window.addEventListener('unhandledrejection', unhandled)
  vi.spyOn(document, 'startViewTransition').mockImplementation(update => {
    const done = Promise.resolve(typeof update === 'function' ? update() : undefined).then(() => undefined)
    const transition: ViewTransition = {
      ready: skipped(),
      finished: skipped(),
      updateCallbackDone: done,
      types: new Set<string>(),
      skipTransition: () => undefined,
    }
    return transition
  })
  const update = vi.fn<() => Promise<void>>(async () => undefined)

  await getRouter().startViewTransition(update)
  await new Promise(resolve => requestAnimationFrame(resolve))

  expect(update).toHaveBeenCalledOnce()
  expect(unhandled).not.toHaveBeenCalled()
  window.removeEventListener('unhandledrejection', unhandled)
})

test('WebKit (Safari, any iOS browser) navigates without a view transition; Blink keeps it', async () => {
  const safari =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15'
  const iosChrome =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/140.0 Mobile/15E148 Safari/604.1'
  const chrome =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36'
  expect([isWebKit(safari), isWebKit(iosChrome), isWebKit(chrome)]).toEqual([true, true, false])
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(safari)
  const start = vi.spyOn(document, 'startViewTransition')
  const update = vi.fn<() => Promise<void>>(async () => undefined)
  await getRouter().startViewTransition(update)
  expect(update).toHaveBeenCalledOnce()
  expect(start).not.toHaveBeenCalled()
})
