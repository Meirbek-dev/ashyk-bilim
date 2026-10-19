import { expect, test } from 'vite-plus/test'

import { headersDeadline, problemError } from './client'

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

const html = (status: number) =>
  new Response('<html>Bad Gateway</html>', { status, headers: { 'content-type': 'text/html' } })

test('a gateway 502-504 without a problem body is «service unavailable», any other bare failure «internal»', async () => {
  expect((await problemError(html(502))).code).toBe('service-unavailable')
  expect((await problemError(html(504))).code).toBe('service-unavailable')
  expect((await problemError(html(500))).code).toBe('internal')
})
