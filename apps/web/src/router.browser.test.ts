import { afterEach, expect, test, vi } from 'vite-plus/test'

import { getRouter } from './router'

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
