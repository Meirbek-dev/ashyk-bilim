/** @vitest-environment jsdom */
// BUG-032: `GET ai/admin/runs` is a keyset page `{items, next_cursor}`; the
// console needs the array (it used to call `runs.filter` on the page object).

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vite-plus/test'

import { apiJson } from '@/lib/api-client'
import { useAIOperationRuns } from '@/features/ai-admin/api/use-ai-usage'

vi.mock('@/lib/api-client', () => ({ apiJson: vi.fn() }))

const page = {
  items: [
    {
      id: '01a09100-0000-7000-8000-000000000001',
      status: 'succeeded',
      feature: 'course_qa',
      retry_count: 0,
      started_at_unix: 1_784_282_400,
      stuck: false,
      context: {},
    },
  ],
  next_cursor: null,
}

describe('useAIOperationRuns (BUG-032)', () => {
  it('unwraps the keyset page into the runs array', async () => {
    vi.mocked(apiJson).mockImplementation(async (_path, _init, parse) => (parse ? parse(page) : page))
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const { result } = renderHook(() => useAIOperationRuns({ days: 7 }), {
      wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(Array.isArray(result.current.data)).toBe(true)
    expect(result.current.data?.map(run => run.id)).toEqual([page.items[0]!.id])
    expect(apiJson).toHaveBeenCalledWith('ai/admin/runs?days=7', undefined, expect.any(Function))
  })
})
