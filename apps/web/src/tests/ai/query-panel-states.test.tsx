/** @vitest-environment jsdom */

import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import { AIOperationsConsole } from '@/features/ai-admin/components/ai-operations-console'
import type { AIOperationRun } from '@/features/ai-admin/api/use-ai-usage'
import { CourseAIHub } from '@/features/course-qa/components/course-ai-hub'

const queryMocks = vi.hoisted(() => ({
  cancel: { isPending: false, mutate: vi.fn() },
  capabilities: {} as Record<string, unknown>,
  detail: {} as Record<string, unknown>,
  runs: {} as Record<string, unknown>,
}))

vi.mock('next-intl', () => ({
  useLocale: () => 'en-US',
  useTranslations: (namespace: string) => (key: string) => `${namespace}.${key}`,
}))

vi.mock('@/features/ai-admin/api/use-ai-usage', () => ({
  useAIOperationRunDetail: () => queryMocks.detail,
  useAIOperationRuns: () => queryMocks.runs,
}))

vi.mock('@/features/ai-experience/api/use-cancel-ai-run', () => ({
  useCancelAIRun: () => queryMocks.cancel,
}))

vi.mock('@/features/ai-experience', () => ({
  useActivityAIUrlState: () => ({ mode: 'ask' }),
  useAIScopeCapabilities: () => queryMocks.capabilities,
}))

vi.mock('@/features/course-analysis/components/course-analysis-entry', () => ({
  CourseAnalysisEntry: () => <div>course-analysis</div>,
}))

vi.mock('@/features/student-study', () => ({
  StudyCompanionPanel: () => <div>study-companion</div>,
}))

vi.mock('@/features/course-qa/components/qa-panel', () => ({
  QAPanel: () => <div>qa-panel</div>,
}))

const run: AIOperationRun = {
  completed_at: '2026-07-17T10:01:00Z',
  context: {},
  cost_estimate: 0.01,
  duration_ms: 1000,
  error_code: null,
  feature: 'course-summary',
  input_tokens: 20,
  model_name: 'test-model',
  output_tokens: 30,
  retry_count: 0,
  run_uuid: 'run-1',
  started_at: '2026-07-17T10:00:00Z',
  status: 'finished',
  stuck: false,
  time_to_first_text_ms: 100,
}

function queryState(data?: unknown) {
  return {
    data,
    error: null,
    isError: false,
    isLoading: false,
    refetch: vi.fn(),
  }
}

describe('AIOperationsConsole query states', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    queryMocks.runs = queryState([])
    queryMocks.detail = queryState()
  })

  it('shows a loading placeholder', () => {
    queryMocks.runs = { ...queryState(), isLoading: true }

    const { container } = render(<AIOperationsConsole />)

    expect(container.querySelector('[data-slot="skeleton"]')).toBeInTheDocument()
  })

  it('shows a retryable hard error when no data was loaded', () => {
    const refetch = vi.fn()
    queryMocks.runs = {
      ...queryState(),
      error: new Error('runs failed'),
      isError: true,
      refetch,
    }

    render(<AIOperationsConsole />)
    fireEvent.click(screen.getByRole('button', { name: 'Errors.retry' }))

    expect(screen.getByText('Errors.somethingWentWrong')).toBeInTheDocument()
    expect(refetch).toHaveBeenCalledOnce()
  })

  it('renders an empty table for an empty successful response', () => {
    render(<AIOperationsConsole />)

    expect(screen.getAllByRole('row')).toHaveLength(1)
    expect(screen.queryByRole('button', { name: 'AiExperience.operationsConsole.inspect' })).not.toBeInTheDocument()
  })

  it('renders successful data', () => {
    queryMocks.runs = queryState([run])

    render(<AIOperationsConsole />)

    expect(screen.getByText('course-summary')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'AiExperience.operationsConsole.inspect' })).toBeInTheDocument()
  })

  it('keeps stale data visible when a background refresh fails', () => {
    queryMocks.runs = {
      ...queryState([run]),
      error: new Error('refresh failed'),
      isError: true,
    }

    render(<AIOperationsConsole />)

    expect(screen.getByRole('alert')).toHaveTextContent('Errors.somethingWentWrong')
    expect(screen.getByText('course-summary')).toBeInTheDocument()
  })
})

describe('CourseAIHub panel query states', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    queryMocks.capabilities = queryState({ modes: [] })
  })

  it('shows a loading placeholder', () => {
    queryMocks.capabilities = { ...queryState(), isLoading: true }

    const { container } = render(<CourseAIHub courseUuid="course-1" variant="panel" />)

    expect(container.querySelector('[data-slot="skeleton"]')).toBeInTheDocument()
  })

  it('shows a retryable hard error when no data was loaded', () => {
    const refetch = vi.fn()
    queryMocks.capabilities = {
      ...queryState(),
      error: new Error('capabilities failed'),
      isError: true,
      refetch,
    }

    render(<CourseAIHub courseUuid="course-1" variant="panel" />)
    fireEvent.click(screen.getByRole('button', { name: 'Errors.retry' }))

    expect(screen.getByText('AiExperience.courseAIHub.capabilityError')).toBeInTheDocument()
    expect(refetch).toHaveBeenCalledOnce()
  })

  it('renders the unavailable state for an empty successful response', () => {
    render(<CourseAIHub courseUuid="course-1" variant="panel" />)

    expect(screen.getByText('AiExperience.courseAIHub.unavailable')).toBeInTheDocument()
  })

  it('renders the selected surface for successful data', () => {
    queryMocks.capabilities = queryState({ modes: ['ask'] })

    render(<CourseAIHub courseUuid="course-1" variant="panel" />)

    expect(screen.getByText('qa-panel')).toBeInTheDocument()
  })

  it('keeps stale capabilities visible when a background refresh fails', () => {
    queryMocks.capabilities = {
      ...queryState({ modes: ['ask'] }),
      error: new Error('refresh failed'),
      isError: true,
    }

    render(<CourseAIHub courseUuid="course-1" variant="panel" />)

    expect(screen.getByRole('alert')).toHaveTextContent('AiExperience.courseAIHub.capabilityError')
    expect(screen.getByText('qa-panel')).toBeInTheDocument()
  })
})
