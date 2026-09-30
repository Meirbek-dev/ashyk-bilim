// BUG-159: the AI capability probe must never fire without a session (a 401 redirects
// anonymous visitors away from a public course landing).
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vite-plus/test'

const mocks = vi.hoisted(() => ({ apiJson: vi.fn(async () => ({ modes: ['analyze'] })), authenticated: false }))
vi.mock('@/lib/api-client', () => ({ apiJson: mocks.apiJson }))
vi.mock('@/components/providers/session-provider', () => ({
  useSessionContext: () => ({ isAuthenticated: mocks.authenticated }),
}))

import { useAIScopeCapabilities } from '@/features/ai-experience/activity-panel/use-ai-scope-capabilities'

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('useAIScopeCapabilities', () => {
  it('does not probe capabilities for an anonymous visitor', async () => {
    mocks.authenticated = false
    const { result } = renderHook(() => useAIScopeCapabilities({ courseUuid: 'c1', surface: 'course-page' }), {
      wrapper,
    })
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(result.current.fetchStatus).toBe('idle')
    expect(mocks.apiJson).not.toHaveBeenCalled()
  })

  it('probes once a session exists', async () => {
    mocks.authenticated = true
    const { result } = renderHook(() => useAIScopeCapabilities({ courseUuid: 'c1', surface: 'course-page' }), {
      wrapper,
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mocks.apiJson).toHaveBeenCalledTimes(1)
  })
})
