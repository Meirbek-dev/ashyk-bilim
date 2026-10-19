import { expect, test } from 'vite-plus/test'

import { headersDeadline } from './client'

const tick = (ms: number) => new Promise(resolve => AbortSignal.timeout(ms).addEventListener('abort', resolve))

test('a read without response headers by the deadline is aborted; one that got them is not', async () => {
  const stuck = headersDeadline(20)
  const answered = headersDeadline(20)
  answered.done()
  await tick(60)
  expect(stuck.signal.aborted).toBe(true)
  expect(stuck.signal.reason).toBeInstanceOf(DOMException)
  expect(answered.signal.aborted).toBe(false)
})
