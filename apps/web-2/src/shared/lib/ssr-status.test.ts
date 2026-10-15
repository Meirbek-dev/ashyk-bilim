import { expect, test, vi } from 'vite-plus/test'

import { ssrStatusHeaders } from './ssr-status'

test('a route error outside the request context is logged without the request id, never thrown', () => {
  const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
  expect(() => ssrStatusHeaders({ matches: [{ error: new Error('boom') }] })).not.toThrow()
  const line = String(write.mock.calls.at(-1)?.[0])
  write.mockRestore()
  expect(JSON.parse(line)).toMatchObject({ level: 'error', msg: 'route error during SSR', error: 'Error: boom' })
})
