/** @vitest-environment jsdom */

import { act, render, renderHook, screen } from '@testing-library/react'
import { EventType } from '@ag-ui/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import { APIError } from '@/lib/api/assertSuccess'

const transport = vi.hoisted(() => ({
  createAGUIAgent: vi.fn(),
}))

vi.mock('@/lib/ag-ui-transport', () => ({
  createAGUIAgent: transport.createAGUIAgent,
}))

vi.mock('next-intl', () => ({
  useLocale: () => 'ru-RU',
  useTranslations: (namespace: string) => {
    const t = (key: string) => `${namespace}.${key}`
    t.has = () => false
    return t
  },
}))

import { AIArtifactLifecycle } from '@/features/ai-experience/components/ai-artifact-lifecycle'
import { AIErrorRecovery } from '@/features/ai-experience/components/ai-error-recovery'
import { isTerminalRunStatus } from '@/features/ai-experience/api/use-ai-run-status'
import { toRunStreamEvent, useAIRunStream } from '@/features/ai-experience/api/use-ai-run-stream'
import { runStatusToWorkState } from '@/features/ai-experience/workspace/use-ai-run-controller'

type AgentOptions = { headers?: Record<string, string>; onEventId?: (id: string) => void }

function fakeAgent(run: (options: AgentOptions) => Promise<unknown>) {
  transport.createAGUIAgent.mockImplementation((_path: string, options: AgentOptions = {}) => ({
    abortRun: vi.fn(),
    runAgent: () => run(options),
  }))
}

describe('v2 run status vocabulary', () => {
  it('maps succeeded/failed/aborted onto the UI states and treats them as terminal', () => {
    expect(runStatusToWorkState('succeeded')).toBe('complete')
    expect(runStatusToWorkState('failed')).toBe('failed')
    expect(runStatusToWorkState('aborted')).toBe('cancelled')
    expect(runStatusToWorkState('running')).toBeNull()
    expect(isTerminalRunStatus('succeeded')).toBe(true)
    expect(isTerminalRunStatus('queued')).toBe(false)
  })

  it('keeps the intermediate run-event states the server emits', () => {
    const event = { type: EventType.CUSTOM, name: 'collecting_context', value: { state: 'collecting_context' } }
    expect(toRunStreamEvent(event as never)?.state).toBe('collecting_context')

    const cancelled = { type: EventType.RUN_ERROR, message: 'AI run was cancelled', code: 'CANCELLED' }
    expect(toRunStreamEvent(cancelled as never)?.state).toBe('cancelled')
  })
})

describe('useAIRunStream reconnect', () => {
  beforeEach(() => {
    // Only the reconnect timer; React's scheduler must keep its real clock.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    transport.createAGUIAgent.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('resumes a dropped live stream with Last-Event-ID set to the last Redis stream id', async () => {
    let calls = 0
    fakeAgent(async options => {
      calls += 1
      if (calls === 1) {
        options.onEventId?.('run-started')
        options.onEventId?.('1789155382715-0')
        throw new Error('network error')
      }
      return { result: null }
    })

    renderHook(() => useAIRunStream('ai/runs/run-1/stream'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500)
    })

    expect(transport.createAGUIAgent).toHaveBeenCalledTimes(2)
    expect(transport.createAGUIAgent.mock.calls[0]?.[1]).not.toHaveProperty('headers')
    expect(transport.createAGUIAgent.mock.calls[1]?.[1]).toMatchObject({
      headers: { 'Last-Event-ID': '1789155382715-0' },
    })
  })

  it('settles on an API error instead of reconnecting', async () => {
    fakeAgent(async () => {
      throw new APIError({ code: 'ai-disabled', message: 'AI features are disabled', status: 503 })
    })

    const { result } = renderHook(() => useAIRunStream('ai/runs/run-1/stream'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })

    expect(transport.createAGUIAgent).toHaveBeenCalledTimes(1)
    expect(result.current.state).toBe('failed')
    expect(result.current.error).toBeInstanceOf(APIError)
  })
})

describe('localized AI surfaces', () => {
  it('renders the artifact lifecycle through the translator', () => {
    render(<AIArtifactLifecycle state="running" artifact={{ final: false }} />)

    expect(screen.getByText('AiExperience.artifactLifecycle.queued')).toBeInTheDocument()
    expect(screen.getByText('AiExperience.artifactLifecycle.draftArtifact')).toBeInTheDocument()
    expect(screen.queryByText('Queued')).not.toBeInTheDocument()
  })

  it('renders a 503 ai-disabled as a localized unavailable state without retry', () => {
    const error = new APIError({ code: 'ai-disabled', message: 'AI features are disabled', status: 503 })

    render(<AIErrorRecovery error={error} onRetry={() => {}} />)

    expect(screen.getByText('AiExperience.errorRecovery.unavailableTitle')).toBeInTheDocument()
    expect(screen.queryByText('AI features are disabled')).not.toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
