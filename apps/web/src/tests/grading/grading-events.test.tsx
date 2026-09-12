/** @vitest-environment jsdom */
import type { ReactNode } from 'react'
import { act, renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import { useCourseGradingEvents } from '@/features/grading/queries/use-grading-events'

vi.mock('@services/config/config', () => ({ getAPIUrl: () => 'http://api.test/api/v2/' }))

const COURSE_ID = '44444444-4444-4444-8444-444444444444'

/** The bits of `EventSource` the hook touches; `emit` plays a named server event. */
class FakeEventSource extends EventTarget {
  static instances: FakeEventSource[] = []
  onerror: ((event: Event) => void) | null = null
  closed = false
  constructor(
    public url: string,
    public init?: EventSourceInit,
  ) {
    super()
    FakeEventSource.instances.push(this)
  }
  close() {
    this.closed = true
  }
  emit(name: string, data: unknown = {}) {
    this.dispatchEvent(new MessageEvent(name, { data: JSON.stringify(data) }))
  }
}

let client: QueryClient
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
)

beforeEach(() => {
  FakeEventSource.instances = []
  vi.stubGlobal('EventSource', FakeEventSource)
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// Q-2026-09-12-2 #2 / gauntlet F27: the course stream replaces polling.
describe('useCourseGradingEvents', () => {
  it('subscribes with credentials and invalidates the grading queries on each event', () => {
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    const { result, unmount } = renderHook(() => useCourseGradingEvents(COURSE_ID), { wrapper })

    const source = FakeEventSource.instances[0]!
    expect(source.url).toBe(`http://api.test/api/v2/courses/${COURSE_ID}/grading/events`)
    expect(source.init).toEqual({ withCredentials: true })
    expect(result.current).toBe(false)

    act(() => source.emit('connected', { event: 'connected', course_id: COURSE_ID }))
    expect(result.current).toBe(true)

    act(() => source.emit('grade.published', { event: 'grade.published', payload: { final_score: 90 } }))
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['grading'] })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['file-submission'] })

    invalidate.mockClear()
    act(() => source.emit('submission.submitted'))
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['grading'] })

    // A stream error drops `live` so the caller's polling fallback kicks in.
    act(() => source.onerror?.(new Event('error')))
    expect(result.current).toBe(false)

    unmount()
    expect(source.closed).toBe(true)
  })

  it('does nothing without a course id', () => {
    renderHook(() => useCourseGradingEvents(undefined), { wrapper })
    expect(FakeEventSource.instances).toHaveLength(0)
  })
})
