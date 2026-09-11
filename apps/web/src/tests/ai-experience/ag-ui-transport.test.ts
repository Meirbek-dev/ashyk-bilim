import { describe, expect, it, vi } from 'vite-plus/test'

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
}))

vi.mock('ofetch', async importOriginal => ({
  ...(await importOriginal<typeof import('ofetch')>()),
  fetch: mocks.fetch,
}))
vi.mock('@services/config/config', () => ({ getAPIUrl: () => 'http://api.test/api/v2' }))

import { createAGUIAgent, observeSseEventIds } from '@/lib/ag-ui-transport'
import { isApiError } from '@/lib/api/assertSuccess'

function chunks(parts: string[]) {
  const encoder = new TextEncoder()
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const part of parts) controller.enqueue(encoder.encode(part))
      controller.close()
    },
  })
}

describe('AG-UI transport', () => {
  it('reports every SSE id line, including ones split across chunks, and passes the bytes through', async () => {
    const ids: string[] = []
    const observed = observeSseEventIds(
      chunks(['id: run-started\nevent: run\ndata: {}\n\nid: 17891', '55382715-0\nevent: run\ndata: {}\n\n']),
      id => ids.push(id),
    )
    const text = await new Response(observed).text()

    expect(ids).toEqual(['run-started', '1789155382715-0'])
    expect(text).toContain('id: 1789155382715-0\nevent: run')
  })

  it('turns a problem+json response into an APIError carrying the contract code', async () => {
    mocks.fetch.mockResolvedValue(
      new Response(JSON.stringify({ status: 503, code: 'ai-disabled', title: 'AI features are disabled' }), {
        headers: { 'content-type': 'application/problem+json' },
        status: 503,
      }),
    )

    const error = await createAGUIAgent('ai/runs/run-1/stream')
      .runAgent()
      .catch((thrown: unknown) => thrown)

    expect(isApiError(error) && error.code).toBe('ai-disabled')
  })

  it('sends the resume header the caller asked for', async () => {
    mocks.fetch.mockResolvedValue(
      new Response(chunks(['id: 1-0\nevent: run\ndata: {"type":"RUN_STARTED","threadId":"t","runId":"r"}\n\n']), {
        headers: { 'content-type': 'text/event-stream' },
        status: 200,
      }),
    )
    const ids: string[] = []

    await createAGUIAgent('ai/runs/run-1/stream', {
      headers: { 'Last-Event-ID': '1-0' },
      onEventId: id => ids.push(id),
    })
      .runAgent()
      .catch(() => null)

    expect(mocks.fetch).toHaveBeenCalledWith(
      'http://api.test/api/v2/ai/runs/run-1/stream',
      expect.objectContaining({ credentials: 'include', headers: expect.objectContaining({ 'Last-Event-ID': '1-0' }) }),
    )
    expect(ids).toEqual(['1-0'])
  })
})
