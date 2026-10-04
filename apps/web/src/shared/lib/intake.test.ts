import { expect, test } from 'vite-plus/test'

import { clientKey, createBudget, readLimited } from './intake'

const post = (body: BodyInit, headers: Record<string, string> = {}) =>
  new Request('http://web.test/_client-error', { method: 'POST', body, headers, duplex: 'half' } as RequestInit)

test('the body read stops past the cap, whatever Content-Length claims', async () => {
  expect(await readLimited(post('{"a":1}'), 8)).toBe('{"a":1}')
  const endless = new ReadableStream<Uint8Array>({
    pull: controller => controller.enqueue(new Uint8Array(1024)),
  })
  expect(await readLimited(post(endless, { 'content-length': '10' }), 8 * 1024)).toBeNull()
})

test('the client is the proxy-set X-Real-IP, never the forgeable X-Forwarded-For', () => {
  expect(clientKey(post('', { 'x-real-ip': '10.0.0.7', 'x-forwarded-for': '1.2.3.4' }))).toBe('10.0.0.7')
  expect(clientKey(post('', { 'x-forwarded-for': '1.2.3.4' }))).toBe('direct')
})

test('a budget allows its rate per window; a full table refuses new clients instead of resetting everyone', () => {
  const over = createBudget(2, 2)
  expect([over('a', 0), over('a', 1), over('a', 2)]).toEqual([false, false, true])
  expect(over('b', 3)).toBe(false)
  expect(over('c', 4)).toBe(true)
  expect(over('a', 5)).toBe(true)
  // Once windows expire, their slots are free again.
  expect(over('c', 70_000)).toBe(false)
})
