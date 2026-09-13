/** @vitest-environment jsdom */

import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'

const mocks = vi.hoisted(() => ({
  apiJson: vi.fn(),
  createAGUIAgent: vi.fn(),
  runAgent: vi.fn(),
}))

vi.mock('@/lib/ag-ui-transport', () => ({ createAGUIAgent: mocks.createAGUIAgent }))
vi.mock('@/lib/api-client', () => ({ apiJson: mocks.apiJson }))
vi.mock('next-intl', () => ({ useLocale: () => 'kk-KZ' }))

import { useQAThread } from '@/features/course-qa/api/use-ask-question'
import { useCourseQAChat } from '@/features/course-qa/api/use-course-qa-chat'
import { qaCitations } from '@/features/course-qa/lib/citation-utils'

const COURSE_ID = '44444444-4444-4444-8444-444444444444'
const THREAD_ID = '01a091f8-999e-70cf-a46f-16a545b5ebc9'

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

function wireMessage(role: 'user' | 'assistant', citations: unknown) {
  return {
    id: role === 'user' ? '01a091f8-99a4-722d-9c20-8f8b2c2f23eb' : '01a091f8-9b53-77c2-bf71-d7f1f0894dec',
    thread_id: THREAD_ID,
    course_id: COURSE_ID,
    user_id: '01a0910c-796a-7bf1-8475-cb7d3130f81a',
    role,
    client_turn_id: null,
    content: 'hi',
    confidence: null,
    citations,
    metadata: {},
    created_at_unix: 1_789_155_384,
  }
}

describe('course Q&A on the v2 wire', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.createAGUIAgent.mockReturnValue({
      abortRun: vi.fn(),
      runAgent: mocks.runAgent,
      setMessages: vi.fn(),
      threadId: '',
    })
  })

  it('forwards thread_id/activity_id and continues the thread the server answers with', async () => {
    mocks.runAgent.mockResolvedValue({ result: { thread_id: THREAD_ID, message_id: 'm', confidence: 'low' } })
    const onThread = vi.fn()
    const { result } = renderHook(
      () => useCourseQAChat({ activityUuid: 'act-1', courseUuid: COURSE_ID, onThread, threadUuid: null }),
      { wrapper },
    )

    await act(async () => {
      await result.current.submit('What is a closure?')
    })

    expect(mocks.runAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        forwardedProps: expect.objectContaining({ activity_id: 'act-1', thread_id: null, language: 'kk' }),
      }),
      expect.anything(),
    )
    expect(onThread).toHaveBeenCalledWith(THREAD_ID)
  })

  it('reads a transcript whose user turns carry `citations: []`', async () => {
    mocks.apiJson.mockImplementation((_path: string, _init: unknown, parse: (value: unknown) => unknown) =>
      Promise.resolve(parse([wireMessage('user', []), wireMessage('assistant', { citations: [{ id: 'c1' }] })])),
    )

    const { result } = renderHook(() => useQAThread(COURSE_ID, THREAD_ID), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toHaveLength(2)
    expect(qaCitations(result.current.data![0]!)).toEqual([])
    expect(qaCitations(result.current.data![1]!)).toEqual([{ id: 'c1' }])
  })
})
