import { describe, expect, it, vi } from 'vite-plus/test'

const apiJson = vi.fn(async (_path: string, _init: { body: string }) => ({ logged: true }))
vi.mock('@/lib/api-client', () => ({ apiJson: (path: string, init: { body: string }) => apiJson(path, init) }))

import { reportClientError } from '@/services/telemetry/client'

describe('reportClientError (BUG-366)', () => {
  it('clips long strings so a Cyrillic SSR crash report fits the /api/log-error cap', async () => {
    const huge = 'Ошибка рендеринга '.repeat(4000)
    await reportClientError({
      page: '/kz/user/x',
      error: { message: huge, name: 'Error', stack: huge },
      componentStack: huge,
    })
    const body = apiJson.mock.calls[0]![1].body
    expect(new TextEncoder().encode(body).length).toBeLessThan(64 * 1024)
    const sent = JSON.parse(body)
    expect(sent.error.message).toHaveLength(2001)
    expect(sent.componentStack.startsWith('Ошибка рендеринга')).toBe(true)
    expect(sent.page).toBe('/kz/user/x')
  })
})
